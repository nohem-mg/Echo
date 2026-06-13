/**
 * Echo dev API gateway — bridges CRE contract (:8080) to GAGEXCM microservices.
 *
 * Proxied (real services):
 *   POST /api/convert      { audioFile }  → { midiSequence }        via basic-pitch-service :8001
 *   POST /api/check/public { audioFile }  → { matches }             via acrcloud-service    :8002
 *
 * Mocked (until Jean delivers):
 *   POST /api/compare/private    POST /api/compare/commercial    POST /api/report
 *
 * Run (host):   bun backend/dev-gateway/server.ts
 * Requires:     docker compose up  (basic-pitch-service + acrcloud-service)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.ECHO_GATEWAY_PORT ?? 8080);
const BASIC_PITCH_URL = process.env.ECHO_BASIC_PITCH_URL ?? "http://127.0.0.1:8001";
const ACRCLOUD_URL = process.env.ECHO_ACRCLOUD_URL ?? "http://127.0.0.1:8002";
const DEV_AUDIO = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/audio/arpeggio.wav",
);

const ATTESTATION_HEADER = "x-chainlink-confidential-attestation";

const attestation = () => `mock-tee-${crypto.randomUUID()}`;

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { [ATTESTATION_HEADER]: attestation() },
  });

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

const serviceHealthy = async (baseUrl: string): Promise<boolean> => {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
};

const basicPitchHealthy = () => serviceHealthy(BASIC_PITCH_URL);
const acrCloudHealthy = () => serviceHealthy(ACRCLOUD_URL);

// ---------------------------------------------------------------------------
// /api/convert  — proxy to basic-pitch-service (:8001)
// ---------------------------------------------------------------------------

/** Local dev: audioRef is an opaque string — always proxy to the BasicPitch test fixture. */
const proxyConvert = async (audioFile: string) => {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(DEV_AUDIO)], { type: "audio/wav" }), "arpeggio.wav");

  const res = await fetch(`${BASIC_PITCH_URL}/convert`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`basic-pitch ${res.status}: ${text}`);
  }

  const body = (await res.json()) as { midi_sequence: unknown };
  console.log(`[gateway] convert via BasicPitch (audioRef=${audioFile.slice(0, 32)}…)`);
  // CRE contract: { midiSequence: string }
  return { midiSequence: JSON.stringify(body.midi_sequence) };
};

/** Fallback when Docker / BasicPitch is not running yet. */
const mockConvert = (audioFile: string) => {
  console.log(`[gateway] convert MOCK — start Docker: cd backend && docker compose up`);
  return { midiSequence: JSON.stringify({ notes: [], duration_s: 0, n_notes: 0, mock: true, audioRef: audioFile }) };
};

// ---------------------------------------------------------------------------
// /api/check/public  — proxy to acrcloud-service (:8002)
// ---------------------------------------------------------------------------

/**
 * Proxies to the real acrcloud-service. The service receives multipart audio,
 * extracts fingerprints locally, and calls ACRCloud with fingerprints only.
 * Response is normalised to the CRE contract: { matches: [{ ISRC, confidence_score }] }
 */
const proxyCheckPublic = async (audioFile: string) => {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(DEV_AUDIO)], { type: "audio/wav" }), "arpeggio.wav");

  const res = await fetch(`${ACRCLOUD_URL}/api/check/public`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`acrcloud-service ${res.status}: ${text}`);
  }

  // Service returns { matches: PublicMatch[], cover_matches: PublicMatch[], request_id }
  // CRE contract:  { matches: [{ ISRC, confidence_score }] }
  // Extra fields are stripped; cover_matches not forwarded (Step 3 uses ISRCs only).
  const body = (await res.json()) as {
    matches: Array<{ ISRC: string | null; confidence_score: number }>;
  };
  console.log(`[gateway] check/public via ACRCloud (${body.matches.length} matches, audioRef=${audioFile.slice(0, 32)}…)`);
  return {
    matches: body.matches
      .filter((m) => m.confidence_score >= 50) // AGENTS.md: never return below 50%
      .map((m) => ({ ISRC: m.ISRC ?? "", confidence_score: m.confidence_score })),
  };
};

/** Fallback when acrcloud-service is down or credentials are missing. */
const mockCheckPublic = (audioFile: string) => {
  console.log(`[gateway] check/public MOCK — start Docker + set ACRCloud credentials (audioRef=${audioFile.slice(0, 32)}…)`);
  return { matches: [{ ISRC: "USRC12345", confidence_score: 68 }] };
};

// ---------------------------------------------------------------------------
// Mock routes for endpoints not yet implemented by Jean
// ---------------------------------------------------------------------------

const mockRoutes: Record<string, () => unknown> = {
  "/api/compare/private": () => ({
    registry_matches: [{ track_id: "t-42", similarity_score: 40 }],
  }),
  "/api/compare/commercial": () => ({
    commercial_deltas: [{ ISRC: "USRC12345", melodic: 72, rhythmic: 81, structural: 55 }],
  }),
  "/api/report": () => ({
    verdict: "CLEAN",
    submitted_track: { key: "A", mode: "min", BPM: 171, fingerprint: "fp-abc" },
    similar_tracks: [
      {
        rank: 1,
        title: "Blinding Lights — The Weeknd",
        source: "ACRCloud",
        score: 68,
        melody: 72,
        rhythm: 81,
        structure: 55,
        key: "A min",
        BPM: 171,
      },
    ],
    ai_summary: "Aucune similarité significative (<75%). Track éligible au SEAL.",
  }),
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // -- Health ---------------------------------------------------------------
    if (pathname === "/health") {
      const [bp, acr] = await Promise.all([basicPitchHealthy(), acrCloudHealthy()]);
      return json({ status: "ok", basic_pitch: bp ? "ok" : "down", acrcloud: acr ? "ok" : "down" });
    }

    // -- Step 1: /api/convert -------------------------------------------------
    if (pathname === "/api/convert" && req.method === "POST") {
      const { audioFile } = (await req.json()) as { audioFile?: string };
      if (!audioFile) return json({ code: "validation_error", message: "audioFile required" }, 422);

      if (await basicPitchHealthy()) {
        try {
          return json(await proxyConvert(audioFile));
        } catch (err) {
          console.error("[gateway] basic-pitch error:", err);
          return json({ code: "upstream_error", message: String(err) }, 502);
        }
      }
      return json(mockConvert(audioFile));
    }

    // -- Step 2A: /api/check/public -------------------------------------------
    if (pathname === "/api/check/public" && req.method === "POST") {
      const { audioFile } = (await req.json()) as { audioFile?: string };
      if (!audioFile) return json({ code: "validation_error", message: "audioFile required" }, 422);

      if (await acrCloudHealthy()) {
        try {
          return json(await proxyCheckPublic(audioFile));
        } catch (err) {
          // Service is up but returned an error (e.g. missing credentials) — fall back to mock.
          console.warn("[gateway] acrcloud proxy failed, falling back to mock:", String(err));
          return json(mockCheckPublic(audioFile));
        }
      }
      return json(mockCheckPublic(audioFile));
    }

    // -- Steps 2B / 3 / 4: mocked until Jean delivers -------------------------
    const mock = mockRoutes[pathname];
    if (mock && req.method === "POST") {
      await req.text();
      console.log(`[gateway] mock ${pathname}`);
      return json(mock());
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`Echo dev gateway → http://127.0.0.1:${PORT}`);
console.log(`  BasicPitch upstream  → ${BASIC_PITCH_URL}`);
console.log(`  ACRCloud upstream    → ${ACRCLOUD_URL}`);
console.log(`  Attestation header   → ${ATTESTATION_HEADER}`);
console.log(`  Mocked endpoints     → /api/compare/private  /api/compare/commercial  /api/report`);
