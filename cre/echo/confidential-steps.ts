// ==========================================================================
// Echo — Confidential pipeline steps (sensitive agents via TEE)
// Mirrors steps.ts but routes through ConfidentialHTTPClient.
//
// Only the steps wired into client.ts live here: convert (Step 1) and
// check-public (Step 2A). The remaining steps run over the plain HTTP path in
// steps.ts; if they are ever moved behind the confidential client, add their
// confidential variants back here.
// ==========================================================================

import type { Runtime } from "@chainlink/cre-sdk";
import {
  confidentialBackendPost,
  type ConfidentialClientContext,
  type ConfidentialClientOptions,
} from "./confidential-backend";
import type { Deferred } from "./backend";
import type { CheckPublicResponse, ConvertResponse } from "./types";

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
