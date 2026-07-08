"use client";

import { useMemo, useState } from "react";
import { type Abi } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import escrowAbiJson from "@/lib/abi/LicenseEscrow.json";
import { echoConfig } from "@/lib/config";
import type { Listing } from "@/lib/licensing";

const escrowAbi = escrowAbiJson.abi as Abi;

export type MatchedListing = {
  id: `0x${string}`;
  listing: Listing;
};

/**
 * Looks up escrow listings for a Track ID: fetches every listing id, batch-reads
 * their structs, and filters to the searched track. Search is driven by
 * `submit(rawTrackId)`.
 */
export function useListingSearch() {
  const [searchedTrackId, setSearchedTrackId] = useState<string | null>(null);
  const escrowReady = Boolean(echoConfig.escrowAddress);

  const { data: listingIds, isLoading: loadingIds } = useReadContract({
    address: echoConfig.escrowAddress as `0x${string}`,
    abi: escrowAbi,
    functionName: "getListingIds",
    query: { enabled: Boolean(searchedTrackId && escrowReady) },
  }) as { data: `0x${string}`[] | undefined; isLoading: boolean };

  const listingContracts = useMemo(
    () =>
      (listingIds ?? []).map((id) => ({
        address: echoConfig.escrowAddress as `0x${string}`,
        abi: escrowAbi,
        functionName: "getListing" as const,
        args: [id] as [`0x${string}`],
      })),
    [listingIds],
  );

  const { data: listingsData, isLoading: loadingListings } = useReadContracts({
    contracts: listingContracts,
    query: { enabled: listingContracts.length > 0 },
  });

  const matchingListings = useMemo<MatchedListing[]>(() => {
    if (!listingIds || !listingsData || !searchedTrackId) return [];
    const normalized = searchedTrackId.toLowerCase();
    return listingIds.flatMap((id, i) => {
      const result = listingsData[i];
      if (result?.status !== "success") return [];
      const listing = result.result as Listing;
      if (listing.trackId.toLowerCase() !== normalized) return [];
      return [{ id, listing }];
    });
  }, [listingIds, listingsData, searchedTrackId]);

  function submit(rawTrackId: string) {
    const trimmed = rawTrackId.trim();
    if (!trimmed) return;
    // Accept raw bytes32 with or without the 0x prefix.
    setSearchedTrackId(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
  }

  return {
    escrowReady,
    searchedTrackId,
    matchingListings,
    isSearching: loadingIds || loadingListings,
    submit,
  };
}
