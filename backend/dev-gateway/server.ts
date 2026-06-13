/**
 * Echo dev API gateway — bridges CRE contract (:8080) to backend microservices.
 *
 * CRE expects:  POST /api/convert  { audioFile }  → { midiSequence }
 * BasicPitch:   POST /convert       multipart file → { midi_sequence, ... }
 *
 * Run (host):   bun backend/dev-gateway/server.ts
 * Requires:     basic-pitch-service on :8001 (docker compose up)
 *               soundcloud-service  on :8003 (docker compose up)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getUnlinkRouteHandlers } from "./unlink-gateway.ts";

const PORT = Number(process.env.ECHO_GATEWAY_PORT ?? 8080);
const BASIC_PITCH_URL = process.env.ECHO_BASIC_PITCH_URL ?? "http://127.0.0.1:8001";
const SOUNDCLOUD_URL = process.env.ECHO_SOUNDCLOUD_URL ?? "http://127.0.0.1:8003";
const DEV_AUDIO = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/audio/arpeggio.wav",
);

const unlinkRoutes = getUnlinkRouteHandlers();

const ATTESTATION_HEADER = "x-chainlink-confidential-attestation";

const attestation = () => `mock-tee-${crypto.randomUUID()}`;

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { [ATTESTATION_HEADER]: attestation() },
  });

const basicPitchHealthy = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${BASIC_PITCH_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
};

const soundCloudHealthy = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${SOUNDCLOUD_URL}/health`, { signal: AbortSignal.timeout(2000) });
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

/** Local dev: Walrus refs are not fetchable yet — use the BasicPitch test fixture. */
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
  return { midiSequence: JSON.stringify(body.midi_sequence) };
};

/** Fallback when Docker / BasicPitch is not running yet. */
const mockConvert = (audioFile: string) => {
  console.log(`[gateway] convert MOCK — start Docker: cd backend && docker compose up`);
  return { midiSequence: JSON.stringify({ notes: [], duration_s: 0, n_notes: 0, mock: true, audioRef: audioFile }) };
};

const mockRoutes: Record<string, () => unknown> = {
  "/api/check/public": () => ({
    matches: [{ ISRC: "USRC12345", confidence_score: 68 }],
  }),
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

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const { pathname } = new URL(req.url);

    if (pathname === "/health") {
      return json({
        status: "ok",
        basic_pitch: (await basicPitchHealthy()) ? "ok" : "down",
        soundcloud: (await soundCloudHealthy()) ? "ok" : "down",
      });
    }

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

    // --- SoundCloud upload: direct proxy to soundcloud-service (no payment layer) ---
    if (pathname === "/api/soundcloud/upload" && req.method === "POST") {
      if (await soundCloudHealthy()) {
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
console.log(`  BasicPitch upstream → ${BASIC_PITCH_URL}`);
console.log(`  Attestation header  → ${ATTESTATION_HEADER}`);




