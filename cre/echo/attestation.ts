// ==========================================================================
// Echo — Confidential AI attestation helpers
// --------------------------------------------------------------------------
// Agent responses from ConfidentialHTTPClient may carry a TEE attestation in
// response headers. We collect those per step and bundle them into a CRE
// DON-signed report for the Registry callback (Cyriac).
// ==========================================================================

import {
  bytesToHex,
  getHeader,
  hexToBase64,
  prepareReportRequest,
  Report,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { CONFIDENTIAL_HTTP_CLIENT_PB } from "@chainlink/cre-sdk/pb";
import { encodeAbiParameters, parseAbiParameters, type Hex } from "viem";
import type { AgentAttestation, PipelineResult } from "./types";

type HTTPResponse = CONFIDENTIAL_HTTP_CLIENT_PB.HTTPResponse;

/** Header names tried in order when extracting a TEE attestation from an agent response. */
export const ATTESTATION_HEADER_CANDIDATES = [
  "x-chainlink-confidential-attestation",
  "x-confidential-attestation",
  "chainlink-attestation",
  "x-attestation",
] as const;

/** Collects per-step agent attestations during a confidential pipeline run. */
export type AttestationCollector = {
  push: (attestation: AgentAttestation) => void;
  list: () => readonly AgentAttestation[];
};

export function createAttestationCollector(): AttestationCollector {
  const items: AgentAttestation[] = [];
  return {
    push: (attestation) => items.push(attestation),
    list: () => items,
  };
}

/** Reads the first matching attestation header from a confidential HTTP response. */
export function extractAttestationFromResponse(
  response: HTTPResponse,
  step: string,
): AgentAttestation | undefined {
  for (const name of ATTESTATION_HEADER_CANDIDATES) {
    const value = getHeader(response, name);
    if (value && value.length > 0) {
      return { step, attestation: value };
    }
  }
  return undefined;
}

/**
 * Ensures a confidential agent response carries an attestation header.
 * Throws if missing — fail-fast on incomplete TEE evidence.
 */
export function requireAgentAttestation(response: HTTPResponse, step: string): AgentAttestation {
  const attestation = extractAttestationFromResponse(response, step);
  if (!attestation) {
    throw new Error(
      `missing Confidential AI attestation on ${step} (expected one of: ${ATTESTATION_HEADER_CANDIDATES.join(", ")})`,
    );
  }
  return attestation;
}

/**
 * ABI-encoded payload for runtime.report().
 * The Registry.onReport receiver decodes abi.encode(address owner, bytes32 commitmentHash,
 * bytes32 registryRef) from rawReport and derives trackId on-chain.
 * Reaching onReport already means CLEAN — no verdict byte is written.
 */
export function encodeCallbackReportPayload(result: PipelineResult): Hex {
  return encodeAbiParameters(
    parseAbiParameters("address owner, bytes32 commitmentHash, bytes32 registryRef"),
    [
      result.owner as Hex,
      result.commitmentHash as Hex,
      (result.registryRef ?? `0x${"00".repeat(32)}`) as Hex,
    ],
  );
}

/**
 * Builds a DON-signed CRE report (hex rawReport) bundling verdict,
 * commitmentHash, and all agent attestations for Registry.onReport().
 * Returns both the hex attestation string and the Report object
 * (needed by EVMClient.writeReport for on-chain dispatch).
 */
export function buildOnChainAttestation(
  runtime: Runtime<unknown>,
  result: PipelineResult,
): { attestation: string; report: Report } {
  const encodedPayload = encodeCallbackReportPayload(result);
  const creReport = runtime.report(prepareReportRequest(encodedPayload)).result();
  return { attestation: bytesToHex(creReport.rawReport()), report: creReport };
}

/** Validates that every collected agent attestation is non-empty. */
export function verifyAgentAttestations(attestations: readonly AgentAttestation[]): void {
  for (const { step, attestation } of attestations) {
    if (!attestation || attestation.trim().length === 0) {
      throw new Error(`empty Confidential AI attestation for step ${step}`);
    }
  }
}

/** Convenience: encode payload as base64 for runtime.report() debugging. */
export function encodeCallbackReportPayloadBase64(result: PipelineResult): string {
  return hexToBase64(encodeCallbackReportPayload(result));
}
