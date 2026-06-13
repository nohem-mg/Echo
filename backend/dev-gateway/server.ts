/**
 * Echo dev API gateway — bridges the CRE contract (:8080) to the microservices.
 *
 * The CRE calls one backend (:8080) with JSON routes; each maps to a service:
 *   POST /api/convert          { audioFile }   → basic-pitch    :8001  /api/convert
 *   POST /api/check/public     { audioFile }   → acrcloud       :8002  /api/check/public
 *   POST /api/compare/private  { midiSequence }→ midi-similarity:8003  /api/compare/private
 *   POST /api/registry         { track_id, … } → registry       :8004  /api/registry   (SEAL)
 *   POST /api/compare/commercial               → (mock — service not built yet)
 *   POST /api/report                           → (mock — service not built yet)
 *
 * Contract translation:
 *   - audioRef is resolved to bytes: a signed http(s) URL is fetched for real; any
 *     other ref falls back to the shared dev fixture, logged as a stand-in.
 *   - midiSequence arrives as a JSON string (convert's output); compare/registry want
 *     an object, so we parse it before forwarding.
 *   - check/public: only matches >= 50% are forwarded (AGENTS.md), normalised to
 *     { ISRC, confidence_score }; cover_matches passed through for downstream use.
 *
 * Run (host):  bun backend/dev-gateway/server.ts   (services up: cd backend && docker compose up)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.ECHO_GATEWAY_PORT ?? 8080);
const BASIC_PITCH_URL = process.env.ECHO_BASIC_PITCH_URL ?? "http://127.0.0.1:8001";
const ACRCLOUD_URL = process.env.ECHO_ACRCLOUD_URL ?? "http://127.0.0.1:8002";
const MIDI_URL = process.env.ECHO_MIDI_URL ?? "http://127.0.0.1:8003";
const REGISTRY_URL = process.env.ECHO_REGISTRY_URL ?? "http://127.0.0.1:8004";

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

const healthy = async (baseUrl: string): Promise<boolean> => {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
};

/** Resolve an audioRef to bytes. A signed http(s) URL is fetched for real; any other
 *  ref falls back to the shared dev fixture (logged), so the pipeline stays runnable.
 *
 *  NOTE — confidentiality: fetching a hosted URL means the audio was put on a server,
 *  which is NOT the confidential path (the raw audio must never be exposed before the
 *  artist's REVEAL). URL-fetch here is a DEV/TEST convenience only. The faithful path is
 *  a direct multipart upload straight into the service (in-memory, temp file deleted
 *  after processing, never persisted) — in prod the audio stays inside the TEE. */
const resolveAudio = async (audioRef: string): Promise<{ bytes: Uint8Array; filename: string }> => {
  if (audioRef.startsWith("http://") || audioRef.startsWith("https://")) {
    const res = await fetch(audioRef, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`fetch audioRef → ${res.status}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), filename: audioRef.split("/").pop() || "audio" };
  }
  console.warn(`[gateway] audioRef '${audioRef.slice(0, 40)}' not a fetchable URL — using DEV FIXTURE`);
  return { bytes: readFileSync(DEV_AUDIO), filename: "arpeggio.wav" };
};

/** Resolve audioRef → bytes, POST as multipart to an audio service, return its JSON. */
const postAudio = async (baseUrl: string, path: string, audioRef: string): Promise<any> => {
  const { bytes, filename } = await resolveAudio(audioRef);
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
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
  const body = (await postAudio(BASIC_PITCH_URL, "/api/convert", audioFile)) as { midi_sequence: unknown };
  console.log(`[gateway] convert via basic-pitch (audioRef=${audioFile.slice(0, 32)}…)`);
  return { midiSequence: JSON.stringify(body.midi_sequence) }; // CRE contract: { midiSequence: string }
};

// Step 2A — acoustic fingerprint. CRE reads matches[].{ISRC, confidence_score}.
const proxyCheckPublic = async (audioFile: string) => {
  const body = (await postAudio(ACRCLOUD_URL, "/api/check/public", audioFile)) as {
    matches: Array<{ ISRC: string | null; confidence_score: number }>;
    cover_matches?: Array<{ ISRC: string | null; confidence_score: number }>;
  };
  console.log(`[gateway] check/public via acrcloud (${body.matches.length} matches, audioRef=${audioFile.slice(0, 32)}…)`);
  return {
    // AGENTS.md: never return below 50%. Normalised to the CRE contract shape.
    matches: body.matches
      .filter((m) => m.confidence_score >= 50)
      .map((m) => ({ ISRC: m.ISRC ?? "", confidence_score: m.confidence_score })),
    cover_matches: body.cover_matches ?? [], // melodic candidates, passed through
  };
};

// Step 2B — compositional similarity. midiSequence is a JSON string → parse → forward.
const proxyComparePrivate = async (midiSequence: string) => {
  const midi = JSON.parse(midiSequence);
  const body = await postJson(MIDI_URL, "/api/compare/private", { midiSequence: midi });
  console.log(`[gateway] compare/private via midi-similarity (${body.registry_matches?.length ?? 0} match)`);
  return body; // { registry_matches, request_id }
};

// SEAL — persist the track in the private registry. Called by the CRE at the end.
const proxyRegister = async (payload: { track_id: string; midiSequence: string; fingerprint?: unknown }) => {
  const body = await postJson(REGISTRY_URL, "/api/registry", {
    track_id: payload.track_id,
    midiSequence: JSON.parse(payload.midiSequence),
    fingerprint: payload.fingerprint ?? null,
  });
  console.log(`[gateway] registry add via registry-service (track_id=${payload.track_id})`);
  return body; // { track_id, request_id }
};

/** Fallbacks when a service isn't up yet — keeps the CRE DAG runnable in pure-mock mode. */
const mockConvert = (audioFile: string) => {
  console.log("[gateway] convert MOCK — start Docker: cd backend && docker compose up");
  return { midiSequence: JSON.stringify({ notes: [], duration_s: 0, n_notes: 0, mock: true, audioRef: audioFile }) };
};
const mockCheckPublic = () => ({ matches: [{ ISRC: "USRC12345", confidence_score: 68 }], cover_matches: [] });
const mockComparePrivate = () => ({ registry_matches: [{ track_id: "t-42", similarity_score: 40 }] });

// Services not built yet — always mocked.
const mockRoutes: Record<string, () => unknown> = {
  "/api/compare/commercial": () => ({
    commercial_deltas: [{ ISRC: "USRC12345", melodic: 72, rhythmic: 81, structural: 55 }],
  }),
  "/api/report": () => ({
    verdict: "CLEAN",
    submitted_track: { key: "A", mode: "min", BPM: 171, fingerprint: "fp-abc" },
    similar_tracks: [
      { rank: 1, title: "Blinding Lights — The Weeknd", source: "ACRCloud", score: 68, melody: 72, rhythm: 81, structure: 55, key: "A min", BPM: 171 },
    ],
    ai_summary: "Aucune similarité significative (<75%). Track éligible au SEAL.",
  }),
};

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
      const [bp, acr, midi, reg] = await Promise.all([
        healthy(BASIC_PITCH_URL),
        healthy(ACRCLOUD_URL),
        healthy(MIDI_URL),
        healthy(REGISTRY_URL),
      ]);
      return json({
        status: "ok",
        basic_pitch: bp ? "ok" : "down",
        acrcloud: acr ? "ok" : "down",
        midi_similarity: midi ? "ok" : "down",
        registry: reg ? "ok" : "down",
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
      const { midiSequence } = (await req.json()) as { midiSequence?: string };
      if (!midiSequence) return json({ code: "validation_error", message: "midiSequence required" }, 422);
      if (!(await healthy(MIDI_URL))) return json(mockComparePrivate());
      try {
        return json(await proxyComparePrivate(midiSequence));
      } catch (err) {
        return upstreamError(err);
      }
    }

    // -- SEAL: /api/registry --------------------------------------------------
    if (pathname === "/api/registry" && req.method === "POST") {
      const payload = (await req.json()) as { track_id?: string; midiSequence?: string; fingerprint?: unknown };
      if (!payload.track_id || !payload.midiSequence) {
        return json({ code: "validation_error", message: "track_id and midiSequence required" }, 422);
      }
      if (!(await healthy(REGISTRY_URL))) return json({ code: "upstream_error", message: "registry down" }, 502);
      try {
        return json(await proxyRegister(payload as { track_id: string; midiSequence: string; fingerprint?: unknown }));
      } catch (err) {
        return upstreamError(err);
      }
    }

    // -- Steps 3 / 4: mocked until the services exist -------------------------
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
console.log(`  basic-pitch     → ${BASIC_PITCH_URL}   (POST /api/convert)`);
console.log(`  acrcloud        → ${ACRCLOUD_URL}   (POST /api/check/public)`);
console.log(`  midi-similarity → ${MIDI_URL}   (POST /api/compare/private)`);
console.log(`  registry        → ${REGISTRY_URL}   (POST /api/registry — SEAL)`);
console.log(`  commercial / report → mock (services not built yet)`);
console.log(`  attestation header  → ${ATTESTATION_HEADER}`);
