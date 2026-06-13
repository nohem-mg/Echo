// ==========================================================================
// Echo — Confidential pipeline steps (sensitive agents A–D via TEE)
// Mirrors steps.ts but routes through ConfidentialHTTPClient.
// ==========================================================================

import type { Runtime } from "@chainlink/cre-sdk";
import {
  confidentialBackendPost,
  type ConfidentialClientContext,
  type ConfidentialClientOptions,
} from "./confidential-backend";
import type { Deferred } from "./backend";
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


/** Escape a JSON string value for embedding in a bodyString `"{{.key}}"` slot. */
const midiSequenceEscaped = (midiSequence: string) => JSON.stringify(midiSequence).slice(1, -1);

function confPost<C, T>(
  runtime: Runtime<C>,
  baseUrl: string,
  path: string,
  step: string,
  bodyString: string,
  templatePublicValues: Record<string, string>,
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<T> {
  return confidentialBackendPost<C, T>(
    runtime,
    baseUrl,
    path,
    step,
    { bodyString, templatePublicValues },
    ctx,
    options,
  );
}

// Agent B — BasicPitch: raw audio -> MIDI (sensitive unreleased audio).
export function stepConvertConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  audioRef: string,
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<ConvertResponse> {
  return confPost(
    runtime,
    baseUrl,
    "/api/convert",
    "step1-convert",
    '{"audioFile":"{{.audioRef}}"}',
    { audioRef },
    ctx,
    options,
  );
}

// Agent A — ACRCloud fingerprint (sensitive unreleased audio).
export function stepCheckPublicConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  audioRef: string,
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<CheckPublicResponse> {
  return confPost(
    runtime,
    baseUrl,
    "/api/check/public",
    "step2a-check-public",
    '{"audioFile":"{{.audioRef}}"}',
    { audioRef },
    ctx,
    options,
  );
}

// Agent C — MIDI comparison vs private registry (sensitive unreleased MIDI).
export function stepComparePrivateConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  midiSequence: string,
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<ComparePrivateResponse> {
  return confPost(
    runtime,
    baseUrl,
    "/api/compare/private",
    "step2b-compare-private",
    '{"midiSequence":"{{.midiSequenceEscaped}}"}',
    { midiSequenceEscaped: midiSequenceEscaped(midiSequence) },
    ctx,
    options,
  );
}

// Agent D — MIDI comparison vs commercial previews.
export function stepCompareCommercialConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  midiSequence: string,
  ISRCs: string[],
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<CompareCommercialResponse> {
  return confPost(
    runtime,
    baseUrl,
    "/api/compare/commercial",
    "step3-compare-commercial",
    '{"midiSequence":"{{.midiSequenceEscaped}}","ISRCs":{{.isrcsJson}}}',
    { midiSequenceEscaped: midiSequenceEscaped(midiSequence), isrcsJson: JSON.stringify(ISRCs) },
    ctx,
    options,
  );
}

// SEAL — persist unreleased MIDI in the private registry (verdict CLEAN only).
export function stepRegisterConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  args: { trackId: string; midiSequence: string; fingerprint?: string },
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<RegisterResponse> {
  const fingerprintJson = args.fingerprint
    ? JSON.stringify({ hash: args.fingerprint })
    : "null";
  return confPost(
    runtime,
    baseUrl,
    "/api/registry",
    "step5-registry-seal",
    '{"track_id":"{{.trackId}}","midiSequence":"{{.midiSequenceEscaped}}","fingerprint":{{.fingerprintJson}}}',
    {
      trackId: args.trackId,
      midiSequenceEscaped: midiSequenceEscaped(args.midiSequence),
      fingerprintJson,
    },
    ctx,
    options,
  );
}

// Agent E — acoustic extraction + final report (sensitive audio + profile).
export function stepReportConfidential<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  args: {
    audioRef: string;
    midiSequence: string;
    registry_matches: RegistryMatch[];
    commercial_deltas: CommercialDelta[];
  },
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions,
): Deferred<ReportResponse> {
  return confPost(
    runtime,
    baseUrl,
    "/api/report",
    "step4-report",
    '{"audioFile":"{{.audioRef}}","midiSequence":"{{.midiSequenceEscaped}}","registry_matches":{{.registryJson}},"commercial_deltas":{{.commercialJson}}}',
    {
      audioRef: args.audioRef,
      midiSequenceEscaped: midiSequenceEscaped(args.midiSequence),
      registryJson: JSON.stringify(args.registry_matches),
      commercialJson: JSON.stringify(args.commercial_deltas),
    },
    ctx,
    options,
  );
}
