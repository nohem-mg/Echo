import { createHash } from "node:crypto";
import type { Abi, Hex, Log, PublicClient } from "viem";
import { parseEventLogs } from "viem";
import registryAbi from "@/lib/abi/Registry.json";

const registryContractAbi = registryAbi.abi as Abi;

export function toRegistryBytes32(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function buildFlowCommitmentHash(_flowId: string, trackFingerprint: string): `0x${string}` {
  return toRegistryBytes32(`commitment:${trackFingerprint}`);
}

export function buildFlowRegistryRef(uploadTrackId: string): `0x${string}` {
  return toRegistryBytes32(`registry-ref:${uploadTrackId}`);
}

/** CRE-only track id when no on-chain registerTrack is possible (analysis / REJECTED path). */
export function buildProvisionalCreTrackId(uploadTrackId: string): `0x${string}` {
  return toRegistryBytes32(`registry-track:${uploadTrackId}`);
}

export function worldNullifierToBigInt(nullifierHash: string): bigint {
  if (/^0x[0-9a-fA-F]+$/.test(nullifierHash)) {
    try {
      return BigInt(nullifierHash);
    } catch {
      // Fall through to deterministic hash for malformed hex strings.
    }
  }

  return BigInt(toRegistryBytes32(nullifierHash));
}

export function parseTrackRegisteredTrackId(
  logs: Log[],
  registryAddress: `0x${string}`,
): `0x${string}` | undefined {
  const events = parseEventLogs({
    abi: registryContractAbi,
    logs,
    eventName: "TrackRegistered",
  }) as Array<{ address: `0x${string}`; args: { trackId?: Hex } }>;

  const match = events.find((event) => event.address.toLowerCase() === registryAddress.toLowerCase());
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
  artistAddress: `0x${string}`,
  commitmentHash: `0x${string}`,
): Promise<`0x${string}` | undefined> {
  const trackIds = (await publicClient.readContract({
    address: registryAddress,
    abi: registryContractAbi,
    functionName: "getArtistTracks",
    args: [artistAddress],
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

