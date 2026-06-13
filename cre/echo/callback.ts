// ==========================================================================
// Echo — Registry callback payload (Cyriac Registry.onReport)
// --------------------------------------------------------------------------
// Section 5 will wire EVMClient.writeReport() once the Registry address is
// available. Section 4 prepares the attestation-bearing payload now.
// ==========================================================================

import type { PipelineResult, Verdict } from "./types";

/**
 * Payload dispatched to Registry for a CLEAN seal.
 * SIMILAR, REJECTED, and ERROR never produce an on-chain callback.
 */
export type RegistryCallbackPayload = {
  trackId: string;
  verdict: Verdict;
  /** Hex-encoded CRE rawReport bytes (DON-signed, verified on-chain by the forwarder). */
  attestation: string;
};

/** Builds the callback payload for CLEAN only. */
export function buildRegistryCallback(
  result: PipelineResult,
): RegistryCallbackPayload | undefined {
  if (result.verdict !== "CLEAN" || !result.attestation) {
    return undefined;
  }
  return {
    trackId: result.trackId,
    verdict: result.verdict,
    attestation: result.attestation,
  };
}
