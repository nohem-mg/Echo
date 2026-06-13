// ==========================================================================
// Echo — The 6 backend calls in the DAG (one per GAGEXCM endpoint)
// Each step returns a deferred handle: `.result()` forces resolution.
// ==========================================================================

import type { Runtime } from "@chainlink/cre-sdk";
import { backendPost, type Deferred } from "./backend";
import type {
  CheckPublicResponse,
  CommercialDelta,
  CompareCommercialResponse,
  ComparePrivateResponse,
  ConvertResponse,
  RegisterResponse,
  RegistryMatch,
  ReportResponse,
} from "./types";

// Step 1 — BasicPitch: raw audio -> MIDI sequence. Prerequisite for 2A and 2B.
export function stepConvert<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  audioRef: string,
): Deferred<ConvertResponse> {
  return backendPost<C, ConvertResponse>(runtime, baseUrl, "/api/convert", {
    audioFile: audioRef,
  });
}

// Step 2A — ACRCloud: acoustic fingerprint vs public base.
export function stepCheckPublic<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  audioRef: string,
): Deferred<CheckPublicResponse> {
  return backendPost<C, CheckPublicResponse>(runtime, baseUrl, "/api/check/public", {
    audioFile: audioRef,
  });
}

// Step 2B — MIDI algo: comparison vs private registry (PostgreSQL).
export function stepComparePrivate<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  midiSequence: string,
): Deferred<ComparePrivateResponse> {
  return backendPost<C, ComparePrivateResponse>(runtime, baseUrl, "/api/compare/private", {
    midiSequence,
  });
}

// Step 3 — submitted MIDI vs commercial MIDIs (from 2A ISRCs).
export function stepCompareCommercial<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  midiSequence: string,
  ISRCs: string[],
): Deferred<CompareCommercialResponse> {
  return backendPost<C, CompareCommercialResponse>(runtime, baseUrl, "/api/compare/commercial", {
    midiSequence,
    ISRCs,
  });
}

// SEAL — persist track in the private registry (verdict CLEAN only).
export function stepRegister<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  args: { trackId: string; midiSequence: string; fingerprint?: string },
): Deferred<RegisterResponse> {
  return backendPost<C, RegisterResponse>(runtime, baseUrl, "/api/registry", {
    track_id: args.trackId,
    midiSequence: args.midiSequence,
    ...(args.fingerprint ? { fingerprint: { hash: args.fingerprint } } : {}),
  });
}

// Step 4 — acoustic extraction (raw audio) + ranked final report.
export function stepReport<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  args: {
    audioRef: string;
    midiSequence: string;
    registry_matches: RegistryMatch[];
    commercial_deltas: CommercialDelta[];
  },
): Deferred<ReportResponse> {
  return backendPost<C, ReportResponse>(runtime, baseUrl, "/api/report", {
    audioFile: args.audioRef,
    midiSequence: args.midiSequence,
    registry_matches: args.registry_matches,
    commercial_deltas: args.commercial_deltas,
  });
}
