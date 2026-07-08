"use client";

import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { ChevronDown, Copy, ExternalLink, Tag, X } from "lucide-react";
import { parseUnits, type Abi } from "viem";
import { usePublicClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import registryAbi from "@/lib/abi/Registry.json";
import { echoConfig } from "@/lib/config";
import { useUnlinkEscrow } from "@/lib/hooks/use-unlink-escrow";
import { UnlinkDepositPanel } from "@/components/common/unlink-deposit-panel";

const registryContractAbi = registryAbi.abi as Abi;

const LICENSE_LABELS = ["Sync", "Beat", "Full"] as const;
const DURATION_LABELS = ["1 an", "Perpétuel"] as const;

type SellRightsModalProps = {
  trackId: string;
  onClose: () => void;
};

export function SellRightsModal({ trackId, onClose }: SellRightsModalProps) {
  const [priceInput, setPriceInput] = useState("100");
  const [licenseType, setLicenseType] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const registryClient = usePublicClient({ chainId: sepolia.id });

  const { createListing, isPending, isSuccess, error, reset, txHash: listingTxHash, deposit, resetDeposit, isDepositing, isDepositSuccess, depositError } = useUnlinkEscrow();
  const visibleError = listingError ?? error;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setListingError(null);
    reset();

    try {
      await ensureTrackIsSealed();
      const price = parseUnits(priceInput || "0", 18);
      await createListing(trackId as `0x${string}`, price, licenseType, duration);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "Listing failed";
      setListingError(msg);
    }
  }

  async function ensureTrackIsSealed() {
    if (!echoConfig.registryAddress || !registryClient) {
      throw new Error("Registry client is not ready. Reload the page and retry.");
    }

    const entry = (await registryClient.readContract({
      address: echoConfig.registryAddress as `0x${string}`,
      abi: registryContractAbi,
      functionName: "getEntry",
      args: [trackId as `0x${string}`],
    })) as { timestamp?: bigint; status?: number };

    const timestamp = entry.timestamp ?? BigInt(0);
    if (timestamp === BigInt(0) || entry.status !== 0) {
      throw new Error("This Track ID is not SEALED in the Registry yet. Wait for the CRE seal or refresh the flow.");
    }
  }

  async function handleCopyTrackId() {
    await navigator.clipboard.writeText(trackId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md rounded-[8px] border border-white/15 bg-[#0a0a0a] p-6 text-[#f8f6ee] shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white/80" type="button">
          <X className="size-5" />
        </button>

        <div className="mb-1 flex items-center gap-2">
          <Tag className="size-4 text-[#f59abd]" />
          <p className="text-sm uppercase tracking-wider text-white/45">Vendre mes droits</p>
        </div>
        <h2 className="font-display text-2xl font-black">Créer un listing</h2>

        <div className="mt-4 rounded-[6px] border border-white/10 bg-white/5 px-3 py-2">
          <p className="mb-1 text-xs text-white/40">Track ID à partager avec l&apos;acheteur</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-[#9ef7c9]">{trackId}</code>
            <button
              type="button"
              onClick={handleCopyTrackId}
              className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-xs text-white/60 transition hover:border-[#f59abd] hover:text-[#f59abd]"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <UnlinkDepositPanel
            isDepositing={isDepositing}
            isDepositSuccess={isDepositSuccess}
            depositError={depositError}
            deposit={deposit}
            resetDeposit={resetDeposit}
          />
        </div>

        {isSuccess ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 rounded-[6px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-3 text-sm text-[#9ef7c9]">
              <Check className="size-4 shrink-0" />
              Listing créé via Unlink · privé.
              {listingTxHash && (
                <a
                  href={`${echoConfig.registryExplorer}/tx/${listingTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs underline opacity-70"
                >
                  Etherscan <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <p className="text-center text-xs text-white/40">
              Partagez le Track ID ci-dessus avec l&apos;acheteur.
              <br />
              Il le saisira sur{" "}
              <a href="/marketplace" className="text-[#f59abd] underline">
                /marketplace
              </a>{" "}
              pour acheter la licence.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-white/40">Type de licence</label>
                <div className="relative">
                  <select
                    value={licenseType}
                    onChange={(e) => setLicenseType(Number(e.target.value))}
                    className="w-full appearance-none rounded-[6px] border border-white/15 bg-black px-3 py-2 text-sm text-white focus:border-[#f59abd]/50 focus:outline-none"
                  >
                    {LICENSE_LABELS.map((label, i) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-white/30" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/40">Durée</label>
                <div className="relative">
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full appearance-none rounded-[6px] border border-white/15 bg-black px-3 py-2 text-sm text-white focus:border-[#f59abd]/50 focus:outline-none"
                  >
                    {DURATION_LABELS.map((label, i) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-white/30" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/40">Prix (UNLINK tokens)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full rounded-[6px] border border-white/15 bg-black px-3 py-2 text-sm text-white focus:border-[#f59abd]/50 focus:outline-none"
                placeholder="100"
              />
              <p className="mt-1 text-xs text-white/30">Payé en token Unlink via ExecutionAccount privé</p>
            </div>

            {visibleError && (
              <div className="flex items-start gap-2 rounded-[6px] border border-[#ff7777]/30 bg-[#ff7777]/10 p-3 text-xs text-[#ff7777]">
                <span className="shrink-0">Erreur :</span>
                <span className="break-all">{visibleError.split("\n")[0]?.slice(0, 140)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setListingError(null);
                    reset();
                  }}
                  className="ml-auto shrink-0 opacity-60 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !priceInput || Number(priceInput) <= 0 || !registryClient}
              className="w-full rounded-[6px] bg-[#f59abd] py-3 text-sm font-semibold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Signature Unlink en cours…" : `Mettre en vente · ${priceInput || "0"} UNLINK`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
