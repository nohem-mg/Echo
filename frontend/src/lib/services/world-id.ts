import type { IDKitResult } from "@worldcoin/idkit-core";

export type WorldQrState = {
  connectorURI: string;
  imageDataUrl: string;
};

export function createMockProof(action: string): IDKitResult {
  return {
    protocol_version: "3.0",
    nonce: `mock-${crypto.randomUUID()}`,
    action,
    environment: "staging",
    user_presence_completed: true,
    responses: [
      {
        identifier: "orb",
        signal_hash: "0xmock_signal",
        proof: "0xmock_proof",
        merkle_root: "0xmock_root",
        nullifier: `0x${crypto.randomUUID().replaceAll("-", "")}`,
      },
    ],
  };
}

export function getProofNullifier(result: IDKitResult): string {
  const firstResponse = result.responses[0];

  if (!firstResponse) {
    return "";
  }

  if ("nullifier" in firstResponse) {
    return firstResponse.nullifier;
  }

  if ("session_nullifier" in firstResponse) {
    return firstResponse.session_nullifier[0] ?? "";
  }

  return "";
}
