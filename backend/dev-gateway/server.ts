/**
 * Echo dev API gateway — bridges the CRE contract (:8080) to the microservices.
 *
 * The CRE calls one backend (:8080) with JSON routes; each maps to a service:
 *   POST /api/convert          { audioFile }   → basic-pitch    :8001  /api/convert
 *   POST /api/check/public     { audioFile }   → acrcloud       :8002  /api/check/public
 *   POST /api/compare/private  { midiSequence }→ midi-similarity:8003  /api/compare/private
 *   POST /api/registry         { track_id, … } → registry       :8004  /api/registry   (SEAL)
 *   POST /api/compare/commercial               → (mock — service not built yet)
 *   POST /api/report         { audio + meta }  → report-service :8005  /api/report
 *   POST /api/soundcloud/upload{ file, meta }  → soundcloud-svc :8006  /api/soundcloud/upload
 *
 * Contract translation:
 *   - audioRef resolution (dev):
 *       file://backend/fixtures/audio/upload.mp3  — local file (repo-relative or absolute)
 *       https://…                                 — fetched over HTTP
 *       ECHO_DEV_AUDIO=/path/to/track.mp3         — override when sim sends `<no value>`
 *       (fallback)                                — arpeggio.wav fixture
 *   - Set ECHO_GATEWAY_VERBOSE=1 for detailed request/response logs (default: on).
 *
 * Run (host):  bun backend/dev-gateway/server.ts   (services up: cd backend && docker compose up)
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { 
  parseAgentkitHeader, 
  validateAgentkitMessage, 
  verifyAgentkitSignature, 
  createAgentBookVerifier 
} from "@worldcoin/agentkit";

import { getUnlinkRouteHandlers } from "./unlink-gateway.ts";

const reportTrialCounts = new Map<string, number>();
const agentBook = createAgentBookVerifier();


const PORT = Number(process.env.ECHO_GATEWAY_PORT ?? 8080);
const BASIC_PITCH_URL = process.env.ECHO_BASIC_PITCH_URL ?? "http://127.0.0.1:8001";
const ACRCLOUD_URL = process.env.ECHO_ACRCLOUD_URL ?? "http://127.0.0.1:8002";
const MIDI_URL = process.env.ECHO_MIDI_URL ?? "http://127.0.0.1:8003";
const REGISTRY_URL = process.env.ECHO_REGISTRY_URL ?? "http://127.0.0.1:8004";
const REPORT_URL = process.env.ECHO_REPORT_URL ?? "http://127.0.0.1:8005";
const SOUNDCLOUD_URL = process.env.ECHO_SOUNDCLOUD_URL ?? "http://127.0.0.1:8006";
const VERBOSE = process.env.ECHO_GATEWAY_VERBOSE !== "0";
const DEV_AUDIO_OVERRIDE = process.env.ECHO_DEV_AUDIO;
/** CRE sim: HTTP resp ≤250 KB, consensus observation ≤25 KB — long tracks need a short clip. */
const MAX_AUDIO_SECONDS = Number(process.env.ECHO_MAX_AUDIO_SECONDS ?? 15);

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEV_AUDIO = join(REPO_ROOT, "backend/fixtures/audio/arpeggio.wav");
const DEFAULT_UPLOAD = join(REPO_ROOT, "backend/fixtures/audio/upload.mp3");

type UnlinkRouteHandlers = Record<string, (req: Request) => Promise<Response>>;

const ATTESTATION_HEADER = "x-chainlink-confidential-attestation";
const attestation = () => `mock-tee-${crypto.randomUUID()}`;

const vlog = (...args: unknown[]) => {
  if (VERBOSE) console.log("[gateway]", ...args);
};

async function loadUnlinkRoutes(): Promise<UnlinkRouteHandlers> {
  if (!process.env.UNLINK_API_KEY?.trim() || !process.env.UNLINK_MNEMONIC?.trim()) {
    vlog("unlink disabled (UNLINK_API_KEY / UNLINK_MNEMONIC not set)");
    return {};
  }

  try {
    const { getUnlinkRouteHandlers } = await import("./unlink-gateway.ts");
    return getUnlinkRouteHandlers();
  } catch (error) {
    console.warn(
      "[gateway] Unlink routes disabled:",
      error instanceof Error ? error.message : String(error),
    );
    return {};
  }
}

const unlinkRoutes = await loadUnlinkRoutes();

/** CRE sends midiSequence as a JSON string; ConfidentialHTTP may send a parsed object. */
const normalizeMidiSequence = (raw: string | Record<string, unknown>) =>
  typeof raw === "string" ? JSON.parse(raw) : raw;

const formatBytes = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;

const summarizeMidi = (raw: string | Record<string, unknown>) => {
  try {
    const m = normalizeMidiSequence(raw) as { n_notes?: number; duration_s?: number; notes?: unknown[] };
    return `${m.n_notes ?? m.notes?.length ?? "?"} notes, ${m.duration_s ?? "?"}s`;
  } catch {
    return typeof raw === "string" ? `${raw.length} chars` : "object";
  }
};

const isUnusableAudioRef = (audioRef: string) =>
  !audioRef ||
  audioRef === "<no value>" ||
  audioRef.includes("echo-backend.xyz");

const readLocalAudio = (path: string, source: string) => {
  const resolved = path.startsWith("/") ? path : join(REPO_ROOT, path);
  if (!existsSync(resolved)) throw new Error(`audio file not found: ${resolved}`);
  const { size } = statSync(resolved);
  vlog(`audio ← ${source}: ${resolved} (${formatBytes(size)})`);
  return { bytes: readFileSync(resolved), filename: basename(resolved) };
};

const probeDurationSeconds = (path: string): number | null => {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  const n = Number(r.stdout?.trim());
  return Number.isFinite(n) ? n : null;
};

/** Trim long audio so BasicPitch MIDI + CRE HTTP body stay under sim limits (~250 KB). */
const trimAudioIfNeeded = (
  bytes: Uint8Array,
  filename: string,
): { bytes: Uint8Array; filename: string } => {
  if (MAX_AUDIO_SECONDS <= 0) return { bytes, filename };

  const dir = mkdtempSync(join(tmpdir(), "echo-audio-"));
  const input = join(dir, filename.replace(/[^\w.-]/g, "_") || "input");
  const output = join(dir, "clip.mp3");
  try {
    writeFileSync(input, bytes);
    const duration = probeDurationSeconds(input);
    if (duration == null || duration <= MAX_AUDIO_SECONDS) return { bytes, filename };

    const ff = spawnSync(
      "ffmpeg",
      ["-y", "-i", input, "-t", String(MAX_AUDIO_SECONDS), "-q:a", "2", output],
      { encoding: "utf8" },
    );
    if (ff.status !== 0) {
      vlog(`ffmpeg trim failed (${duration.toFixed(0)}s) — sending full file (CRE sim limit: consensus ≤25 KB)`);
      return { bytes, filename };
    }
    const trimmed = readFileSync(output);
    vlog(
      `audio trimmed ${duration.toFixed(1)}s → ${MAX_AUDIO_SECONDS}s (${formatBytes(bytes.length)} → ${formatBytes(trimmed.length)})`,
    );
    return { bytes: trimmed, filename: "clip.mp3" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { [ATTESTATION_HEADER]: attestation() },
  });

const healthy = async (baseUrl: string): Promise<boolean> => {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
};

/**
 * Proxy a multipart SoundCloud upload directly to soundcloud-service.
 * No payment layer — SoundCloud has no upload fee.
 */
const proxySoundCloudUpload = async (req: Request): Promise<Response> => {
  const body = await req.formData();
  const res = await fetch(`${SOUNDCLOUD_URL}/api/soundcloud/upload`, {
    method: "POST",
    body,
  });
  const payload = await res.json();
  if (!res.ok) {
    console.error(`[gateway] soundcloud-service error: ${res.status}`);
  }
  return Response.json(payload, { status: res.status });
};

/** Resolve an audioRef to bytes (dev/test paths — not the prod TEE path). */
const resolveAudio = async (audioRef: string): Promise<{ bytes: Uint8Array; filename: string }> => {
  if (isUnusableAudioRef(audioRef)) {
    if (DEV_AUDIO_OVERRIDE) return readLocalAudio(DEV_AUDIO_OVERRIDE, "ECHO_DEV_AUDIO");
    if (existsSync(DEFAULT_UPLOAD)) return readLocalAudio(DEFAULT_UPLOAD, "default upload.mp3");
    vlog(`audioRef unusable (${audioRef}) — fallback arpeggio.wav`);
    return readLocalAudio(DEV_AUDIO, "fixture");
  }

  if (audioRef.startsWith("file://")) {
    const path = audioRef.slice("file://".length);
    return readLocalAudio(path, "file://");
  }

  if (audioRef.startsWith("http://") || audioRef.startsWith("https://")) {
    vlog(`audio ← fetch: ${audioRef}`);
    const res = await fetch(audioRef, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`fetch audioRef → ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    vlog(`audio ← fetched ${formatBytes(bytes.length)}`);
    return { bytes, filename: audioRef.split("/").pop()?.split("?")[0] || "audio" };
  }

  if (existsSync(audioRef)) return readLocalAudio(audioRef, "path");

  vlog(`audioRef '${audioRef.slice(0, 48)}' unknown — fallback arpeggio.wav`);
  return readLocalAudio(DEV_AUDIO, "fixture");
};

/** Resolve audioRef → bytes, POST as multipart to an audio service, return its JSON. */
const postAudio = async (baseUrl: string, path: string, audioRef: string): Promise<any> => {
  let { bytes, filename } = await resolveAudio(audioRef);
  ({ bytes, filename } = trimAudioIfNeeded(bytes, filename));
  const form = new FormData();
  form.append("file", new Blob([bytes as any]), filename);
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`${baseUrl}${path} → ${res.status}: ${await res.text()}`);
  return res.json();
};

/** POST a JSON body to a service, return its JSON. */
const postJson = async (baseUrl: string, path: string, body: unknown): Promise<any> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${baseUrl}${path} → ${res.status}: ${await res.text()}`);
  return res.json();
};

// Step 1 — audio → MIDI.
const proxyConvert = async (audioFile: string) => {
  vlog(`→ POST /api/convert  audioFile=${JSON.stringify(audioFile)}`);
  const body = (await postAudio(BASIC_PITCH_URL, "/api/convert", audioFile)) as { midi_sequence: unknown };
  const out = { midiSequence: JSON.stringify(body.midi_sequence) };
  const bytes = JSON.stringify(out).length;
  vlog(`← convert OK  ${summarizeMidi(out.midiSequence)}  response=${bytes} bytes`);
  if (bytes > 24_000) {
    vlog(`⚠ CRE sim consensus limit is 25 KB — shorten clip: ECHO_MAX_AUDIO_SECONDS=10`);
  }
  return out;
};

// Step 2A — acoustic fingerprint. CRE reads matches[].{ISRC, confidence_score}.
const proxyCheckPublic = async (audioFile: string) => {
  vlog(`→ POST /api/check/public  audioFile=${JSON.stringify(audioFile)}`);
  const body = (await postAudio(ACRCLOUD_URL, "/api/check/public", audioFile)) as {
    matches: Array<{ ISRC: string | null; confidence_score: number; title?: string; artists?: string[] }>;
    cover_matches?: Array<{ ISRC: string | null; confidence_score: number; title?: string }>;
  };
  const matches = body.matches
    .filter((m) => m.confidence_score >= 50)
    .map((m) => ({
      ISRC: m.ISRC ?? "",
      confidence_score: m.confidence_score,
      title: m.title,
      artists: m.artists,
    }));
  vlog(
    `← check/public OK  raw=${body.matches.length} match(es) ≥50%=${matches.length}`,
    matches.length
      ? matches.map((m) => `${m.ISRC}@${m.confidence_score}%`).join(", ")
      : "(none — Step 3 skipped)",
  );
  if (VERBOSE && body.matches.length > 0 && matches.length === 0) {
    vlog(
      "  below-threshold:",
      body.matches.map((m) => `${m.ISRC ?? "?"}@${m.confidence_score}%`).join(", "),
    );
  }
  return { matches, cover_matches: body.cover_matches ?? [] };
};

// Step 2B — compositional similarity.
const proxyComparePrivate = async (midiSequence: string | Record<string, unknown>) => {
  vlog(`→ POST /api/compare/private  midi=${summarizeMidi(midiSequence)}`);
  const midi = normalizeMidiSequence(midiSequence);
  const body = await postJson(MIDI_URL, "/api/compare/private", { midiSequence: midi });
  const top = (body.registry_matches ?? []) as Array<{ track_id: string; similarity_score: number }>;
  vlog(
    `← compare/private OK  ${top.length} match(es)`,
    top.length ? top.map((m) => `${m.track_id.slice(0, 10)}…@${m.similarity_score}%`).join(", ") : "(none)",
  );
  return body;
};

// SEAL — persist the track in the private registry.
const proxyRegister = async (payload: {
  track_id: string;
  midiSequence: string | Record<string, unknown>;
  fingerprint?: unknown;
}) => {
  vlog(`→ POST /api/registry  track_id=${payload.track_id}  midi=${summarizeMidi(payload.midiSequence)}`);
  const body = await postJson(REGISTRY_URL, "/api/registry", {
    track_id: payload.track_id,
    midiSequence: normalizeMidiSequence(payload.midiSequence),
    fingerprint: payload.fingerprint ?? null,
  });
  vlog(`← registry OK  track_id=${body.track_id ?? payload.track_id}`);
  return body;
};

// Step 4 — acoustic extraction + final report (multipart: audio + JSON metadata).
const proxyReport = async (payload: {
  audioFile: string;
  midiSequence: string | Record<string, unknown>;
  registry_matches: unknown[];
  commercial_deltas: unknown[];
}) => {
  vlog(
    `→ POST /api/report  audioFile=${JSON.stringify(payload.audioFile)}  registry=${payload.registry_matches.length}  commercial=${payload.commercial_deltas.length}`,
  );
  let { bytes, filename } = await resolveAudio(payload.audioFile);
  ({ bytes, filename } = trimAudioIfNeeded(bytes, filename));
  const midiJson =
    typeof payload.midiSequence === "string"
      ? payload.midiSequence
      : JSON.stringify(payload.midiSequence);
  const form = new FormData();
  form.append("file", new Blob([bytes as any]), filename);
  form.append("registry_matches", JSON.stringify(payload.registry_matches ?? []));
  form.append("commercial_deltas", JSON.stringify(payload.commercial_deltas ?? []));
  form.append("midiSequence", midiJson);
  const res = await fetch(`${REPORT_URL}/api/report`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`${REPORT_URL}/api/report → ${res.status}: ${await res.text()}`);
  const body = await res.json();
  vlog(`← report OK  verdict=${body.verdict}  similar=${body.similar_tracks?.length ?? 0}`);
  return body;
};

/** Fallbacks when a service isn't up yet — keeps the CRE DAG runnable in pure-mock mode. */
const mockConvert = (audioFile: string) => {
  vlog("← convert MOCK (basic-pitch down)");
  return { midiSequence: JSON.stringify({ notes: [], duration_s: 0, n_notes: 0, mock: true, audioRef: audioFile }) };
};
const mockCheckPublic = () => {
  vlog("← check/public MOCK");
  return { matches: [{ ISRC: "USRC12345", confidence_score: 68 }], cover_matches: [] };
};
const mockComparePrivate = () => {
  vlog("← compare/private MOCK");
  return { registry_matches: [{ track_id: "t-42", similarity_score: 40 }] };
};

// Step 3 — still mocked until the commercial comparison service exists.
const mockRoutes: Record<string, () => unknown> = {
  "/api/compare/commercial": () => ({
    commercial_deltas: [{ ISRC: "USRC12345", melodic: 72, rhythmic: 81, structural: 55 }],
  }),
};

const mockReport = () => ({
  verdict: "CLEAN",
  submitted_track: { key: "A", mode: "min", BPM: 171, fingerprint: "fp-mock" },
  similar_tracks: [],
  ai_summary: "Aucune similarité significative (<75%). Track éligible au SEAL. (mock — report-service down)",
});

const upstreamError = (err: unknown) => {
  console.error("[gateway] upstream error:", err);
  return json({ code: "upstream_error", message: String(err) }, 502);
};

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // -- Health ---------------------------------------------------------------
    if (pathname === "/health") {
      const [bp, acr, midi, reg, rep, sc] = await Promise.all([
        healthy(BASIC_PITCH_URL),
        healthy(ACRCLOUD_URL),
        healthy(MIDI_URL),
        healthy(REGISTRY_URL),
        healthy(REPORT_URL),
        healthy(SOUNDCLOUD_URL),
      ]);
      return json({
        status: "ok",
        basic_pitch: bp ? "ok" : "down",
        acrcloud: acr ? "ok" : "down",
        midi_similarity: midi ? "ok" : "down",
        registry: reg ? "ok" : "down",
        report: rep ? "ok" : "down",
        soundcloud: sc ? "ok" : "down",
      });
    }

    // -- Step 1: /api/convert -------------------------------------------------
    if (pathname === "/api/convert" && req.method === "POST") {
      const { audioFile } = (await req.json()) as { audioFile?: string };
      if (!audioFile) return json({ code: "validation_error", message: "audioFile required" }, 422);
      if (!(await healthy(BASIC_PITCH_URL))) return json(mockConvert(audioFile));
      try {
        return json(await proxyConvert(audioFile));
      } catch (err) {
        return upstreamError(err);
      }
    }

    // --- SoundCloud upload: direct proxy to soundcloud-service (no payment layer) ---
    if (pathname === "/api/soundcloud/upload" && req.method === "POST") {
      if (await healthy(SOUNDCLOUD_URL)) {
        try {
          return await proxySoundCloudUpload(req);
        } catch (err) {
          console.error("[gateway] soundcloud-service error:", err);
          return json({ code: "upstream_error", message: String(err) }, 502);
        }
      }
      // Mock when soundcloud-service is not running.
      console.log("[gateway] mock /api/soundcloud/upload — start Docker: cd backend && docker compose up");
      return json({
        soundcloud_url: "https://soundcloud.com/echo-demo/mock-track",
        track_id: 999999,
        permalink: "mock-track",
        request_id: crypto.randomUUID(),
      });
    }

    // --- Unlink auth routes (for browser SDK, managed by unlink-gateway.ts) ---
    const unlinkHandler = unlinkRoutes[pathname];
    if (unlinkHandler && req.method === "POST") {
      try {
        return await unlinkHandler(req);
      } catch (err) {
        console.error(`[gateway] unlink error on ${pathname}:`, err);
        return json({ code: "upstream_error", message: String(err) }, 502);
      }
    }

    // -- Step 2A: /api/check/public -------------------------------------------
    if (pathname === "/api/check/public" && req.method === "POST") {
      const { audioFile } = (await req.json()) as { audioFile?: string };
      if (!audioFile) return json({ code: "validation_error", message: "audioFile required" }, 422);
      if (!(await healthy(ACRCLOUD_URL))) return json(mockCheckPublic());
      try {
        return json(await proxyCheckPublic(audioFile));
      } catch (err) {
        // Service up but errored (e.g. missing ACRCloud credentials) — fall back to mock.
        console.warn("[gateway] acrcloud proxy failed, falling back to mock:", String(err));
        return json(mockCheckPublic());
      }
    }

    // -- Step 2B: /api/compare/private ----------------------------------------
    if (pathname === "/api/compare/private" && req.method === "POST") {
      const { midiSequence } = (await req.json()) as {
        midiSequence?: string | Record<string, unknown>;
      };
      if (midiSequence == null) return json({ code: "validation_error", message: "midiSequence required" }, 422);
      if (!(await healthy(MIDI_URL))) return json(mockComparePrivate());
      try {
        return json(await proxyComparePrivate(midiSequence));
      } catch (err) {
        return upstreamError(err);
      }
    }

    // -- SEAL: /api/registry --------------------------------------------------
    if (pathname === "/api/registry" && req.method === "POST") {
      const payload = (await req.json()) as {
        track_id?: string;
        midiSequence?: string | Record<string, unknown>;
        fingerprint?: unknown;
      };
      if (!payload.track_id || payload.midiSequence == null) {
        return json({ code: "validation_error", message: "track_id and midiSequence required" }, 422);
      }
      if (!(await healthy(REGISTRY_URL))) return json({ code: "upstream_error", message: "registry down" }, 502);
      try {
        return json(
          await proxyRegister(payload as {
            track_id: string;
            midiSequence: string | Record<string, unknown>;
            fingerprint?: unknown;
          }),
        );
      } catch (err) {
        return upstreamError(err);
      }
    }

    // -- Step 4: /api/report --------------------------------------------------
    if (pathname === "/api/report" && req.method === "POST") {
      // 1. Verify Human Backed Agent credential (createAgentkitHooks equivalent for Bun)
      const agentkitHeader = req.headers.get("agentkit") || req.headers.get("Agentkit");
      if (!agentkitHeader) {
        const domain = "localhost";
        const uri = "http://localhost:8080/api/report";
        return Response.json({ 
          code: "payment_required", 
          message: "AgentKit header required",
          extensions: {
            agentkit: {
              info: {
                domain,
                uri,
                version: "1",
                nonce: crypto.randomUUID().replace(/-/g, ""),
                issuedAt: new Date().toISOString()
              },
              supportedChains: [{ chainId: "eip155:480", type: "eip191", signatureScheme: "eip191" }]
            }
          }
        }, { 
          status: 402,
          headers: { "WWW-Authenticate": "x402" }
        });
      }

      let nullifier: string;
      try {
        const payload = parseAgentkitHeader(agentkitHeader);
        const resourceUri = new URL(req.url, `http://${req.headers.get("host")}`).toString();
        const validation = await validateAgentkitMessage(payload, resourceUri);
        if (!validation.valid) throw new Error(validation.error);

        const verification = await verifyAgentkitSignature(payload, process.env.ECHO_RPC_URL);
        if (!verification.valid || !verification.address) throw new Error(verification.error);

        const humanId = await agentBook.lookupHuman(verification.address);
        if (!humanId) throw new Error("Agent is not backed by a verified human");
        nullifier = humanId;
      } catch (err: any) {
        vlog("AgentKit verification failed:", err);
        const errMsg = err instanceof Error ? err.message : (err?.message || JSON.stringify(err));
        return json({ code: "unauthorized", message: `AgentKit verification failed: ${errMsg}` }, 401);
      }

      // 2. Trial mechanic
      const trialCount = reportTrialCounts.get(nullifier) || 0;
      if (trialCount >= 3) {
        vlog(`Trial exhausted for nullifier ${nullifier} (count=${trialCount})`);
        return json({ code: "payment_required", message: "Trial épuisé — paiement requis" }, 402);
      }
      
      // Increment immediately so even mocked requests consume trials
      reportTrialCounts.set(nullifier, trialCount + 1);
      vlog(`Trial count for nullifier ${nullifier} incremented to ${trialCount + 1}`);

      const payload = (await req.json()) as {
        audioFile?: string;
        midiSequence?: string | Record<string, unknown>;
        registry_matches?: unknown[];
        commercial_deltas?: unknown[];
      };
      if (!payload.audioFile || payload.midiSequence == null) {
        return json({ code: "validation_error", message: "audioFile and midiSequence required" }, 422);
      }
      if (!(await healthy(REPORT_URL))) {
        vlog("← report MOCK (report-service down)");
        return json(mockReport());
      }
      try {
        const reportResult = await proxyReport({
          audioFile: payload.audioFile,
          midiSequence: payload.midiSequence,
          registry_matches: payload.registry_matches ?? [],
          commercial_deltas: payload.commercial_deltas ?? [],
        });
        

        return json(reportResult);
      } catch (err) {
        return upstreamError(err);
      }
    }

    // -- Step 3: mocked until the commercial service exists -------------------
    const mock = mockRoutes[pathname];
    if (mock && req.method === "POST") {
      await req.text();
      vlog(`→ POST ${pathname}  (MOCK — service not built)`);
      const data = mock();
      vlog(`← ${pathname} MOCK`, JSON.stringify(data).slice(0, 120));
      return json(data);
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`Echo dev gateway → http://127.0.0.1:${PORT}  (verbose=${VERBOSE ? "on" : "off"}, maxAudio=${MAX_AUDIO_SECONDS}s)`);
console.log(`  real audio  → file://backend/fixtures/audio/upload.mp3  |  ECHO_DEV_AUDIO=/path/to/track.mp3`);
console.log(`  basic-pitch     → ${BASIC_PITCH_URL}   (POST /api/convert)`);
console.log(`  acrcloud        → ${ACRCLOUD_URL}   (POST /api/check/public)`);
console.log(`  midi-similarity → ${MIDI_URL}   (POST /api/compare/private)`);
console.log(`  registry        → ${REGISTRY_URL}   (POST /api/registry — SEAL)`);
console.log(`  report          → ${REPORT_URL}   (POST /api/report — Step 4)`);
console.log(`  soundcloud      → ${SOUNDCLOUD_URL}   (POST /api/soundcloud/upload)`);
console.log(`  commercial      → mock (service not built yet)`);
console.log(`  attestation header  → ${ATTESTATION_HEADER}`);
