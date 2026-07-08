import { createHash } from "node:crypto";
import type { Abi, Hex, Log, PublicClient } from "viem";
import { parseEventLogs } from "viem";
import registryAbi from "@/lib/abi/Registry.json";

const registryContractAbi = registryAbi.abi as Abi;

export function toRegistryBytes32(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Derives a deterministic, unlinkable 20-byte EVM owner-key address from the
 * artist's real wallet address (or nullifier hash as fallback).
 *
 * Domain: "echo-owner-key-v1:" prevents cross-context hash collisions.
 *
 * NOTE: In production the browser derives the owner key by signing a fixed
 * message with the real wallet (Unlink flow). This server-side path is used
 * during simulation / dev when no browser signing is available.
 */
export function deriveOwnerKey(walletAddress: string | undefined, nullifierHash: string): `0x${string}` {
  const seed = walletAddress
    ? `echo-owner-key-v1:${walletAddress.toLowerCase()}`
    : `echo-owner-key-v1:nullifier:${nullifierHash}`;
  const hash = createHash("sha256").update(seed).digest("hex");
  // Take the last 20 bytes (40 hex chars) to form the address.
  return `0x${hash.slice(-40)}`;
}

export function buildFlowCommitmentHash(_flowId: string, trackFingerprint: string): `0x${string}` {
  return toRegistryBytes32(`commitment:${trackFingerprint}`);
}

export function buildFlowRegistryRef(uploadTrackId: string): `0x${string}` {
  return toRegistryBytes32(`registry-ref:${uploadTrackId}`);
}

/** CRE-only track id used before a CLEAN on-chain TrackSealed event exists. */
export function buildProvisionalCreTrackId(uploadTrackId: string): `0x${string}` {
  return toRegistryBytes32(`registry-track:${uploadTrackId}`);
}

export function parseTrackSealedTrackId(
  logs: Log[],
  registryAddress: `0x${string}`,
  commitmentHash?: `0x${string}`,
): `0x${string}` | undefined {
  const events = parseEventLogs({
    abi: registryContractAbi,
    logs,
    eventName: "TrackSealed",
  }) as Array<{
    address: `0x${string}`;
    args: { trackId?: Hex; commitmentHash?: Hex };
  }>;

  const match = events.find((event) => {
    if (event.address.toLowerCase() !== registryAddress.toLowerCase()) {
      return false;
    }
    if (!commitmentHash) {
      return true;
    }
    return event.args.commitmentHash?.toLowerCase() === commitmentHash.toLowerCase();
  });
  const trackId = match?.args.trackId;
  return typeof trackId === "string" ? trackId : undefined;
}

export async function isTrackRegisteredOnChain(
  publicClient: PublicClient,
  registryAddress: `0x${string}`,
  trackId: `0x${string}`,
): Promise<boolean> {
  const entry = await publicClient.readContract({
    address: registryAddress,
    abi: registryContractAbi,
    functionName: "getEntry",
    args: [trackId],
  });

  const timestamp = (entry as { timestamp?: bigint }).timestamp ?? BigInt(0);
  return timestamp > BigInt(0);
}

export async function findRegistryTrackIdByCommitment(
  publicClient: PublicClient,
  registryAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  commitmentHash: `0x${string}`,
): Promise<`0x${string}` | undefined> {
  const trackIds = (await publicClient.readContract({
    address: registryAddress,
    abi: registryContractAbi,
    functionName: "getOwnerTracks",
    args: [ownerAddress],
  })) as readonly `0x${string}`[];

  for (const trackId of trackIds) {
    const entry = (await publicClient.readContract({
      address: registryAddress,
      abi: registryContractAbi,
      functionName: "getEntry",
      args: [trackId],
    })) as { commitmentHash?: `0x${string}`; timestamp?: bigint };

    if (
      (entry.timestamp ?? BigInt(0)) > BigInt(0) &&
      entry.commitmentHash?.toLowerCase() === commitmentHash.toLowerCase()
    ) {
      return trackId;
    }
  }

  return undefined;
}
