// ==========================================================================
// Echo — Registry callback payload (Cyriac receiveCRECallback)
// --------------------------------------------------------------------------
// Section 5 will wire EVMClient.writeReport() once the Registry address is
// available. Section 4 prepares the attestation-bearing payload now.
// ==========================================================================

import type { PipelineResult, Verdict } from "./types";

/** Payload expected by Registry.receiveCRECallback(verdict, commitmentHash, attestation). */
export type RegistryCallbackPayload = {
  verdict: Extract<Verdict, "CLEAN">;
  commitmentHash: string;
  /** Hex-encoded CRE rawReport bytes (DON-signed, verifiable on-chain). */
  attestation: string;
};

/**
 * Builds the on-chain callback payload when the pipeline completes with CLEAN
 * and a DON-signed attestation is present. Returns undefined for halts / errors.
 */
export function buildRegistryCallback(
  result: PipelineResult,
): RegistryCallbackPayload | undefined {
  if (result.verdict !== "CLEAN" || !result.attestation) {
    return undefined;
  }
  return {
    verdict: "CLEAN",
    commitmentHash: result.commitmentHash,
    attestation: result.attestation,
  };
}
