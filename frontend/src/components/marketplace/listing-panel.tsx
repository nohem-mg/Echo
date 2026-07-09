"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowUpRight, Check, LockKeyhole, ShoppingCart, Tag, X } from "lucide-react";
import { formatUnits, type Abi } from "viem";
import { useReadContract } from "wagmi";
import escrowAbiJson from "@/lib/abi/LicenseEscrow.json";
import { echoConfig } from "@/lib/config";
import { useLicenseEvents } from "@/lib/hooks/use-license-events";
import { useUnlinkEscrow } from "@/lib/hooks/use-unlink-escrow";
import {
  DURATION_LABELS,
  LICENSE_DESCRIPTIONS,
  LICENSE_LABELS,
  licenseColor,
  type Listing,
  type Purchase,
} from "@/lib/licensing";
import { shortHex } from "@/lib/utils/format";
import { UnlinkDepositPanel } from "@/components/common/unlink-deposit-panel";

const escrowAbi = escrowAbiJson.abi as Abi;

export function ListingPanel({
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

  const isSeller = listing.seller.toLowerCase() === connectedAddress?.toLowerCase();

  const { purchase: unlinkPurchase, confirmAndRelease, isPending, isSuccess, error, reset, txHash: latestTxHash, deposit, resetDeposit, isDepositing, isDepositSuccess, depositError } = useUnlinkEscrow();
  const { purchaseTxHash: eventPurchaseTxHash, confirmTxHash } = useLicenseEvents(listingId, listing.sold);

  function handlePurchase() {
    void unlinkPurchase(listingId, listing.price);
  }

  function handleConfirm() {
    if (!purchase) return;
    void confirmAndRelease(listingId, purchase.buyer);
  }

  const errorMessage = error ? error.split("\n")[0]?.slice(0, 140) : null;
  const priceDisplay = `${formatUnits(listing.price, 18)} UNLINK`;
  const purchaseTxHash = eventPurchaseTxHash ?? latestTxHash;

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
        <div className="mt-4 rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-wider text-white/35">License ID / listingId</p>
          <code className="mt-1 block break-all font-mono text-xs text-[#9ef7c9]">{listingId}</code>
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="text-xs uppercase tracking-wider text-white/35">Escrow contract</p>
            <a
              className="mt-1 inline-flex items-center gap-1 break-all font-mono text-xs text-white/65 underline"
              href={`${echoConfig.registryExplorer}/address/${echoConfig.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              {echoConfig.escrowAddress}
              <ArrowUpRight className="size-3 shrink-0" />
            </a>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-white/45">
            <p>
              Check listing: <code className="text-white/65">LicenseEscrow.getListing({shortHex(listingId)})</code>
            </p>
            <p>
              Check achat: <code className="text-white/65">LicenseEscrow.getPurchase({shortHex(listingId)})</code>
            </p>
          </div>
          {listing.sold && purchase ? (
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs">
              <p className="text-white/45">
                Acheteur Unlink: <code className="text-white/65">{shortHex(purchase.buyer)}</code>
              </p>
              <p className="text-white/45">
                Vendeur Unlink: <code className="text-white/65">{shortHex(listing.seller)}</code>
              </p>
              <p className="text-white/45">
                Montant: <span className="font-mono text-white/65">{formatUnits(purchase.amount, 18)} UNLINK</span>
              </p>
              <p className="text-white/45">
                Vendeur payé:{" "}
                <span className={purchase.confirmed ? "font-mono text-[#9ef7c9]" : "font-mono text-[#ffd166]"}>
                  {purchase.confirmed ? "oui · release atomique" : "non · ancien achat en escrow"}
                </span>
              </p>
            </div>
          ) : null}
          {purchaseTxHash ? (
            <a
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#f59abd] underline"
              href={`${echoConfig.registryExplorer}/tx/${purchaseTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Purchase / release tx {shortHex(purchaseTxHash)}
              <ArrowUpRight className="size-3" />
            </a>
          ) : null}
          {confirmTxHash ? (
            <a
              className="ml-3 mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#9ef7c9] underline"
              href={`${echoConfig.registryExplorer}/tx/${confirmTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Confirm tx {shortHex(confirmTxHash)}
              <ArrowUpRight className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      {/* Action */}
      <div className="border-t border-white/10 p-5 sm:p-6">
        {isSuccess ? (
          <div className="rounded-[6px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-3 text-sm text-[#9ef7c9]">
            <div className="flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              Achat envoyé via Unlink · paiement vendeur atomique.
            </div>
            <p className="mt-2 break-all font-mono text-xs text-[#9ef7c9]/80">License ID: {listingId}</p>
            {latestTxHash ? (
              <a
                href={`${echoConfig.registryExplorer}/tx/${latestTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs underline"
              >
                Tx {shortHex(latestTxHash)}
                <ArrowUpRight className="size-3" />
              </a>
            ) : null}
          </div>
        ) : isSeller ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-white/10 bg-white/5 p-3 text-sm text-white/50">
            <Tag className="size-4" />
            Vous êtes le vendeur de ce listing.
          </div>
        ) : listing.sold && connectedAddress && purchase && !purchase.confirmed ? (
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9ef7c9] py-3 font-bold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-4" />
            {isPending ? "Signature Unlink…" : "Libérer les fonds legacy"}
          </button>
        ) : listing.sold && purchase?.confirmed ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-3 text-sm text-[#9ef7c9]">
            <Check className="size-4" />
            Licence achetée · vendeur payé.
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
              Paiement privé via Unlink ExecutionAccount. Achat et release vendeur sont batchés dans un seul execute().
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
