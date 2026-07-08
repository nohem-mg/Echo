"use client";

import { useEffect, useState } from "react";
import { type Abi } from "viem";
import { usePublicClient } from "wagmi";
import escrowAbiJson from "@/lib/abi/LicenseEscrow.json";
import { echoConfig } from "@/lib/config";

const escrowAbi = escrowAbiJson.abi as Abi;

// Only the most recent window of blocks is scanned. Purchases/confirmations
// older than this lose their explorer links — acceptable for a demo, but note
// it if listings need permanent tx provenance.
const EVENT_LOOKBACK_BLOCKS = BigInt(49_000);
const GENESIS_BLOCK = BigInt(0);

type LicenseEventTxHashes = {
  purchaseTxHash?: `0x${string}`;
  confirmTxHash?: `0x${string}`;
};

/**
 * Resolves the on-chain purchase/confirm transaction hashes for a sold listing
 * by scanning recent `LicensePurchased`/`LicenseConfirmed` events.
 */
export function useLicenseEvents(listingId: `0x${string}`, enabled: boolean): LicenseEventTxHashes {
  const publicClient = usePublicClient({ chainId: echoConfig.registryChainId });
  const [txHashes, setTxHashes] = useState<LicenseEventTxHashes>({});

  useEffect(() => {
    const client = publicClient;
    const escrowAddress = echoConfig.escrowAddress as `0x${string}` | undefined;
    if (!client || !enabled || !escrowAddress) return;

    let cancelled = false;

    async function loadLicenseEvents(
      client: NonNullable<typeof publicClient>,
      escrowAddress: `0x${string}`,
    ) {
      try {
        const latestBlock = await client.getBlockNumber();
        const fromBlock = latestBlock > EVENT_LOOKBACK_BLOCKS ? latestBlock - EVENT_LOOKBACK_BLOCKS : GENESIS_BLOCK;
        const [purchaseEvents, confirmEvents] = await Promise.all([
          client.getContractEvents({
            address: escrowAddress,
            abi: escrowAbi,
            eventName: "LicensePurchased",
            args: { listingId },
            fromBlock,
          }),
          client.getContractEvents({
            address: escrowAddress,
            abi: escrowAbi,
            eventName: "LicenseConfirmed",
            args: { listingId },
            fromBlock,
          }),
        ]);

        if (cancelled) return;

        setTxHashes({
          purchaseTxHash: purchaseEvents.at(-1)?.transactionHash,
          confirmTxHash: confirmEvents.at(-1)?.transactionHash,
        });
      } catch {
        if (!cancelled) {
          setTxHashes({});
        }
      }
    }

    void loadLicenseEvents(client, escrowAddress);

    return () => {
      cancelled = true;
    };
  }, [enabled, listingId, publicClient]);

  return txHashes;
}
