"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowUpRight,
  Check,
  CircleDot,
  LockKeyhole,
  Music,
  Radio,
  Search,
  ShoppingCart,
  Tag,
  X,
} from "lucide-react";
import { formatUnits, type Abi } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { echoConfig } from "@/lib/config";
import escrowAbiJson from "@/lib/abi/LicenseEscrow.json";
import { useUnlinkEscrow } from "@/lib/use-unlink-escrow";
import { UnlinkDepositPanel } from "@/components/unlink-deposit-panel";

const escrowAbi = escrowAbiJson.abi as Abi;

const LICENSE_LABELS = ["Sync", "Beat", "Full"] as const;
const LICENSE_DESCRIPTIONS = [
  "Utilisation dans une synchronisation vidéo / film / pub.",
  "Droit d'utiliser la prod comme base instrumentale.",
  "Cession complète des droits d'utilisation.",
] as const;
const DURATION_LABELS = ["1 an", "Perpétuel"] as const;

type Listing = {
  trackId: `0x${string}`;
  seller: `0x${string}`;
  price: bigint;
  licenseType: number;
  duration: number;
  active: boolean;
  sold: boolean;
  createdAt: bigint;
};

type Purchase = {
  buyer: `0x${string}`;
  amount: bigint;
  confirmed: boolean;
  purchasedAt: bigint;
};

function shortHex(hex: string) {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

function licenseColor(type: number) {
  if (type === 2) return "text-[#f59abd] border-[#f59abd]/40 bg-[#f59abd]/10";
  if (type === 1) return "text-[#ffd166] border-[#ffd166]/40 bg-[#ffd166]/10";
  return "text-[#9ef7c9] border-[#9ef7c9]/40 bg-[#9ef7c9]/10";
}

function ListingPanel({
  listingId,
  listing,
  connectedAddress,
}: {
  listingId: `0x${string}`;
  listing: Listing;
  connectedAddress?: string;
}) {
  const { data: purchase } = useReadContract({
    address: echoConfig.escrowAddress as `0x${string}`,
    abi: escrowAbi,
    functionName: "getPurchase",
    args: [listingId],
    query: { enabled: listing.sold },
  }) as { data: Purchase | undefined };

  const isBuyer = purchase?.buyer?.toLowerCase() === connectedAddress?.toLowerCase();
  const isSeller = listing.seller.toLowerCase() === connectedAddress?.toLowerCase();

  const { purchase: unlinkPurchase, confirmAndRelease, isPending, isSuccess, error, reset, deposit, resetDeposit, isDepositing, isDepositSuccess, depositError } = useUnlinkEscrow();

  function handlePurchase() {
    void unlinkPurchase(listingId, listing.price);
  }

  function handleConfirm() {
    void confirmAndRelease(listingId);
  }

  const errorMessage = error ? error.split("\n")[0]?.slice(0, 140) : null;
  const priceDisplay = `${formatUnits(listing.price, 18)} UNLINK`;

  return (
    <div className="overflow-hidden rounded-[8px] border border-white/15 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40">Track vérifié Echo</p>
            <div className="mt-1 flex items-center gap-2">
              <LockKeyhole className="size-4 text-[#9ef7c9]" />
              <code className="font-mono text-sm text-white/70">{shortHex(listing.trackId)}</code>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${licenseColor(listing.licenseType)}`}>
            {LICENSE_LABELS[listing.licenseType] ?? "?"}
          </span>
        </div>
      </div>

      {/* Infos */}
      <div className="grid gap-px bg-white/10 sm:grid-cols-3">
        {[
          { label: "Prix", value: priceDisplay },
          { label: "Durée", value: DURATION_LABELS[listing.duration] ?? "?" },
          {
            label: "Statut",
            value: listing.sold
              ? purchase?.confirmed
                ? "Confirmé"
                : "Vendu · en attente"
              : listing.active
                ? "Disponible"
                : "Annulé",
          },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0a0a0a] p-4">
            <p className="text-xs text-white/40">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Description licence */}
      <div className="border-t border-white/10 px-5 py-4 sm:px-6">
        <p className="text-sm leading-6 text-white/55">
          <span className="font-semibold text-white/80">{LICENSE_LABELS[listing.licenseType] ?? "?"} ·</span>{" "}
          {LICENSE_DESCRIPTIONS[listing.licenseType] ?? ""}
          {" "}Validité : {DURATION_LABELS[listing.duration] ?? "?"}.
        </p>
        <p className="mt-2 text-xs text-white/30">
          Track ID on-chain :{" "}
          <code className="text-white/50">{listing.trackId}</code>
        </p>
      </div>

      {/* Action */}
      <div className="border-t border-white/10 p-5 sm:p-6">
        {isSuccess ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-3 text-sm text-[#9ef7c9]">
            <Check className="size-4 shrink-0" />
            Transaction envoyée via Unlink · privée.
          </div>
        ) : isSeller ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-white/10 bg-white/5 p-3 text-sm text-white/50">
            <Tag className="size-4" />
            Vous êtes le vendeur de ce listing.
          </div>
        ) : listing.sold && isBuyer && !purchase?.confirmed ? (
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9ef7c9] py-3 font-bold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-4" />
            {isPending ? "Signature Unlink…" : "Confirmer la réception · libérer les fonds"}
          </button>
        ) : listing.sold && purchase?.confirmed ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-3 text-sm text-[#9ef7c9]">
            <Check className="size-4" />
            Licence achetée et confirmée.
          </div>
        ) : listing.sold ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-white/10 bg-white/5 p-3 text-sm text-white/40">
            Cette licence a déjà été achetée.
          </div>
        ) : !listing.active ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-white/10 bg-white/5 p-3 text-sm text-white/40">
            Ce listing a été annulé par le vendeur.
          </div>
        ) : !connectedAddress ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-white/40">Connectez votre wallet pour acheter</p>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handlePurchase}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f59abd] py-3 font-bold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
            >
              <ShoppingCart className="size-4" />
              {isPending ? "Signature Unlink…" : `Acheter · ${priceDisplay}`}
            </button>
            <p className="text-center text-xs text-white/30">
              Paiement privé via Unlink ExecutionAccount. Fonds bloqués en escrow jusqu&apos;à confirmation.
            </p>
            <UnlinkDepositPanel
              isDepositing={isDepositing}
              isDepositSuccess={isDepositSuccess}
              depositError={depositError}
              deposit={deposit}
              resetDeposit={resetDeposit}
            />
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-[6px] border border-[#ff7777]/30 bg-[#ff7777]/10 p-3 text-xs text-[#ff7777]">
            <span className="shrink-0">Erreur :</span>
            <span className="break-all">{errorMessage}</span>
            <button onClick={reset} className="ml-auto shrink-0 opacity-60 hover:opacity-100"><X className="size-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const [searchedTrackId, setSearchedTrackId] = useState<string | null>(null);

  const escrowReady = Boolean(echoConfig.escrowAddress);

  // Load all listing IDs
  const { data: listingIds, isLoading: loadingIds } = useReadContract({
    address: echoConfig.escrowAddress as `0x${string}`,
    abi: escrowAbi,
    functionName: "getListingIds",
    query: { enabled: Boolean(searchedTrackId && escrowReady) },
  }) as { data: `0x${string}`[] | undefined; isLoading: boolean };

  // Batch load all listings
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

  // Filter by searched trackId (normalize both to lowercase for comparison)
  const matchingListings = useMemo(() => {
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

  const isSearching = loadingIds || loadingListings;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    // Accept raw bytes32 or hex with or without 0x prefix
    const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    setSearchedTrackId(normalized);
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#f8f6ee]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#050505]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
                <Radio className="size-5" />
              </span>
              <span className="font-display text-xl font-black">Echo</span>
            </Link>
            <span className="hidden text-white/20 sm:block">·</span>
            <span className="hidden text-sm text-white/50 sm:block">Marketplace</span>
          </div>
          <ConnectButton chainStatus="none" showBalance={false} />
        </div>
      </div>

      <section className="mx-auto w-full max-w-2xl px-4 pb-20 pt-24 sm:px-6">
        <div className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70">
            <CircleDot className="size-4 text-[#9ef7c9]" />
            Licence escrow · Sepolia
          </div>
          <h1 className="font-display text-4xl font-black text-[#f59abd] sm:text-5xl">
            Acheter une licence
          </h1>
          <p className="mt-3 text-white/50">
            Entrez le Track ID partagé par l&apos;artiste pour voir le listing et acheter les droits.
          </p>
        </div>

        {!escrowReady ? (
          <div className="flex flex-col items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 py-16 text-center">
            <CircleDot className="size-8 text-white/20" />
            <p className="text-sm text-white/40">
              Contrat escrow non déployé.
              <br />
              <code className="text-xs text-white/60">NEXT_PUBLIC_ESCROW_ADDRESS</code>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="0x1B2FE051773D10FFB1C404…"
                  className="w-full rounded-[8px] border border-white/15 bg-black py-3 pl-9 pr-4 font-mono text-sm text-white placeholder:text-white/25 focus:border-[#f59abd]/50 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isSearching}
                className="flex items-center gap-2 rounded-[8px] bg-[#f59abd] px-5 py-3 font-bold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
              >
                <ArrowUpRight className="size-4" />
                Chercher
              </button>
            </form>

            <div className="mt-8">
              {!searchedTrackId ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-white/30">
                  <Music className="size-10" />
                  <p className="text-sm">
                    Demandez le Track ID à l&apos;artiste.
                    <br />
                    Il le trouve dans son certificat Echo.
                  </p>
                </div>
              ) : isSearching ? (
                <div className="space-y-3">
                  <div className="h-48 animate-pulse rounded-[8px] border border-white/10 bg-white/5" />
                </div>
              ) : matchingListings.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 py-12 text-center">
                  <Tag className="size-8 text-white/20" />
                  <p className="text-sm text-white/40">
                    Aucun listing trouvé pour ce Track ID.
                    <br />
                    <span className="text-xs text-white/25">
                      Vérifiez que l&apos;artiste a bien créé un listing depuis son certificat.
                    </span>
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {matchingListings.length > 1 && (
                    <p className="text-xs text-white/40">
                      {matchingListings.length} listing(s) trouvé(s) pour ce track.
                    </p>
                  )}
                  {matchingListings.map(({ id, listing }) => (
                    <ListingPanel
                      key={id}
                      listingId={id}
                      listing={listing}
                      connectedAddress={address}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
