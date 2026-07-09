"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowUpRight, CircleDot, Music, Radio, Search, Tag } from "lucide-react";
import { useAccount } from "wagmi";
import { useListingSearch } from "@/lib/hooks/use-listing-search";
import { ListingPanel } from "@/components/marketplace/listing-panel";

export default function MarketplacePage() {
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const { escrowReady, searchedTrackId, matchingListings, isSearching, submit } = useListingSearch();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    submit(input);
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
