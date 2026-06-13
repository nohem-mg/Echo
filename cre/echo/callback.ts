// ==========================================================================
// Echo — Registry callback payload (Cyriac receiveCRECallback)
// --------------------------------------------------------------------------
// Section 5 will wire EVMClient.writeReport() once the Registry address is
// available. Section 4 prepares the attestation-bearing payload now.
// ==========================================================================

import type { PipelineResult, Verdict } from "./types";

/**
 * Payload dispatched to Registry.receiveCRECallback(trackId, Status, rawReport).
 * Built for all non-ERROR verdicts once the DON-signed report is ready.
 */
export type RegistryCallbackPayload = {
  trackId: string;
  verdict: Verdict;
  /** Hex-encoded CRE rawReport bytes (DON-signed, verified on-chain by the forwarder). */
  attestation: string;
};

/** Builds the callback payload for all non-ERROR verdicts. Returns undefined on ERROR. */
export function buildRegistryCallback(
  result: PipelineResult,
): RegistryCallbackPayload | undefined {
  if (result.verdict === "ERROR" || !result.attestation) {
    return undefined;
  }
  return {
    trackId: result.trackId,
    verdict: result.verdict,
    attestation: result.attestation,
  };
}
