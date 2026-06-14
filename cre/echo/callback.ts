// ==========================================================================
// Echo — Registry callback payload (Registry.onReport)
// --------------------------------------------------------------------------
// The new one-pass Registry creates and seals atomically in onReport().
// SIMILAR, REJECTED, and ERROR never produce an on-chain callback.
// ==========================================================================

import type { PipelineResult } from "./types";

/**
 * Payload dispatched to Registry for a CLEAN seal.
 * SIMILAR, REJECTED, and ERROR never produce an on-chain callback.
 * No verdict byte — reaching onReport already means CLEAN.
 */
export type RegistryCallbackPayload = {
  /** Artist's ephemeral owner-key address (never their real wallet). */
  owner: string;
  commitmentHash: string;
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
    owner: result.owner,
    commitmentHash: result.commitmentHash,
    attestation: result.attestation,
  };
}
