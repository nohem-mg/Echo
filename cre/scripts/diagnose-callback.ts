#!/usr/bin/env bun
/**
 * Diagnostic solo callback CRE → Registry (sans redeploy).
 *
 * Usage:
 *   bun cre/scripts/diagnose-callback.ts
 *   bun cre/scripts/diagnose-callback.ts --attestation 0x01faf44e...
 *
 * Rejoue des eth_call Sepolia pour vérifier les 3 pistes (creAddress, payload, trackId)
 * et si Registry.route() réussit quand appelée directement par le MockForwarder.
 */

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const MOCK_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";
const REGISTRY = "0xf011Bb61C7F255571F96FB29cf7b8c7B85FB2Cc0";
const TRACK_ID =
  "0x1B2FE051773D10FFB1C404699FEE582691D792E5EF107768DB693C126B451FCF";

// Dernier rawReport CRE sim réussi (track 0x1B2FE051… @ offset 0x6d).
const DEFAULT_ATTESTATION =
  "0x012aaebb6d070af94a5bfa07e874a6857a624a4d2857a8c1814fa005fd836e2a63000000640000000100000001111111111111111111111111111111111111111111111111111111111111111137306166663136666132aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00011b2fe051773d10ffb1c404699fee582691d792e5ef107768db693c126b451fcf0000000000000000000000000000000000000000000000000000000000000000";

const attArg = process.argv.find((a) => a.startsWith("--attestation="));
const attestationHex = attArg?.slice("--attestation=".length) ?? DEFAULT_ATTESTATION;

async function ethCall(from: string | undefined, to: string, data: string): Promise<string | null> {
  const tx: Record<string, string> = { to, data };
  if (from) tx.from = from;
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [tx, "latest"] }),
  }).then((r) => r.json() as Promise<{ result?: string; error?: { message: string } }>);
  if (res.error) return null;
  return res.result ?? null;
}

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

function encodeBytes(hexNoPrefix: string): string {
  const len = hexNoPrefix.length / 2;
  const padded = hexNoPrefix + "0".repeat(((32 - (len % 32)) % 32) * 2);
  return pad32(len.toString(16)) + padded;
}

function encodeOnReport(reportHex: string, metadataHex = ""): string {
  const sel = "805f2132";
  const off1 = 64;
  const enc1 = encodeBytes(metadataHex);
  const off2 = off1 + enc1.length / 2;
  const enc2 = encodeBytes(reportHex);
  const head = pad32(off1.toString(16)) + pad32(off2.toString(16));
  return "0x" + sel + head + enc1 + enc2;
}

function encodeRoute(validatedReportHex: string, metadataHex = ""): string {
  const sel = "233fd52d";
  const head =
    "0".repeat(64) +
    "0".repeat(64) +
    "0".repeat(64) +
    pad32("a0") +
    pad32((0xa0 + encodeBytes(metadataHex).length / 2).toString(16));
  const body = encodeBytes(metadataHex) + encodeBytes(validatedReportHex);
  return "0x" + sel + head + body;
}

function sliceReport(raw: Uint8Array, start: number, len?: number): string {
  const part = len === undefined ? raw.slice(start) : raw.slice(start, start + len);
  return Buffer.from(part).toString("hex");
}

async function main() {
  const raw = Buffer.from(attestationHex.replace(/^0x/, ""), "hex");

  console.log("=== Echo — diagnostic callback (solo, sans redeploy) ===\n");
  console.log("Registry :", REGISTRY);
  console.log("Forwarder:", MOCK_FORWARDER, "(MockKeystoneForwarder sim)");
  console.log("TrackId  :", TRACK_ID);
  console.log("rawReport:", raw.length, "bytes\n");

  // Piste 1 — creAddress
  const creRaw = await ethCall(undefined, REGISTRY, "0x12d5f556");
  const creAddress = creRaw ? "0x" + creRaw.slice(-40) : "?";
  const p1 = creAddress.toLowerCase() === MOCK_FORWARDER.toLowerCase();
  console.log(`[Piste 1] creAddress = ${creAddress}`);
  console.log(`          match MockForwarder ? ${p1 ? "OUI ✓" : "NON ✗"}\n`);

  // Piste 3 — trackId dans le report
  const at6d = raw.slice(0x6d, 0x6d + 32);
  const trackInReport = "0x" + Buffer.from(at6d).toString("hex");
  const p3 = trackInReport.toLowerCase() === TRACK_ID.toLowerCase();
  console.log(`[Piste 3] trackId @ rawReport[0x6d] = ${trackInReport}`);
  console.log(`          match sample-submission ? ${p3 ? "OUI ✓" : "NON ✗"}\n`);

  // Piste 2 — slices validatedReport
  const cases: { label: string; slice: string }[] = [
    { label: "payload ABI 64B (0x6d..0x6d+64)", slice: sliceReport(raw, 0x6d, 64) },
    { label: "slice forwarder 0x6d (bytecode PUSH1 0x6d)", slice: sliceReport(raw, 0x6d) },
    { label: "slice 0x6b (inclut prefix 0001)", slice: sliceReport(raw, 0x6b) },
    { label: "slice 0x6b+2 (=0x6d)", slice: sliceReport(raw, 0x6b + 2) },
  ];

  // Payload ABI brut (chemin onReport — utilisé par le forwarder en sim)
  const abiPayload = TRACK_ID.slice(2).toLowerCase().padStart(64, "0") + "0".repeat(64);
  const onReportData = encodeOnReport(abiPayload);
  const onReportOut = await ethCall(MOCK_FORWARDER, REGISTRY, onReportData);
  const onReportOk = onReportOut === "0x";
  console.log("[Piste 2a] Registry.onReport() (chemin CRE actuel):\n");
  console.log(`  ${onReportOk ? "PASS" : "FAIL"} — abi.encode(trackId, verdict=0)\n`);

  console.log("[Piste 2b] Registry.route() legacy (msg.sender = MockForwarder):\n");
  for (const c of cases) {
    const data = encodeRoute(c.slice);
    const out = await ethCall(MOCK_FORWARDER, REGISTRY, data);
    const ok = out === "0x0000000000000000000000000000000000000000000000000000000000000001";
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${c.label}`);
  }

  const ifaceRaw = await ethCall(undefined, REGISTRY, "0x01ffc9a7" + "805f2132" + "0".repeat(56));
  const supportsReceiver = ifaceRaw === "0x0000000000000000000000000000000000000000000000000000000000000001";
  console.log(`\n[supportsInterface] IReceiver (onReport) ? ${supportsReceiver ? "OUI ✓" : "NON ✗"}`);

  // Entry on-chain
  const entryData = "0x267b6922" + TRACK_ID.slice(2).toLowerCase();
  const entryRaw = await ethCall(undefined, REGISTRY, entryData);
  const ts = entryRaw ? parseInt(entryRaw.slice(2 + 64 * 2, 2 + 64 * 3), 16) : 0;
  console.log(`\n[getEntry] timestamp = ${ts} ${ts > 0 ? "(track enregistré ✓)" : "(absent ✗)"}`);

  console.log(`
=== Conclusion rapide ===
• Le forwarder sim appelle onReport(), pas route() — regarde surtout [Piste 2a].
• Piste 3 / 2b FAIL si --attestation= pointe vers un ancien trackId (attestation par défaut = dernier sim OK).
• Verdict CLEAN → status reste 0 (SEALED) ; cherche l'event StatusUpdated on-chain.

Logs Registry (cast) :
  FROM=$(($(cast block-number --rpc-url ${RPC}) - 50))
  cast logs --from-block $FROM --to-block latest --address ${REGISTRY} --rpc-url ${RPC}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
