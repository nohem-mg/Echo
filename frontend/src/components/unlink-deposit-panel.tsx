"use client";

import { useState } from "react";
import { Check, Wallet, X } from "lucide-react";

type DepositState = {
  isDepositing: boolean;
  isDepositSuccess: boolean;
  depositError: string | null;
  deposit: (amount: string) => Promise<void>;
  resetDeposit: () => void;
};

export function UnlinkDepositPanel({
  isDepositing,
  isDepositSuccess,
  depositError,
  deposit,
  resetDeposit,
}: DepositState) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-white/10 px-3 py-2 text-xs text-white/45 transition hover:border-[#fff7cf]/30 hover:text-[#fff7cf]"
      >
        <Wallet className="size-3.5" />
        Déposer UNLINK dans le pool privé
      </button>
    );
  }

  return (
    <div className="rounded-[6px] border border-[#fff7cf]/20 bg-[#fff7cf]/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#fff7cf]">Déposer UNLINK → pool privé</p>
        <button
          type="button"
          onClick={() => { setOpen(false); resetDeposit(); }}
          className="text-white/30 hover:text-white/70"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mb-3 text-xs leading-5 text-white/40">
        Tes tokens UNLINK (wallet MetaMask) doivent être déposés dans ton pool Unlink avant toute opération.
        MetaMask demandera une approbation puis un dépôt.
      </p>

      {isDepositSuccess ? (
        <div className="flex items-center gap-2 rounded-[4px] border border-[#9ef7c9]/30 bg-[#9ef7c9]/10 p-2 text-xs text-[#9ef7c9]">
          <Check className="size-3.5 shrink-0" />
          Dépôt confirmé — tu peux maintenant utiliser l&apos;escrow.
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 rounded-[4px] border border-white/15 bg-black px-2 py-1.5 text-xs text-white focus:border-[#fff7cf]/50 focus:outline-none"
            placeholder="100"
          />
          <button
            type="button"
            disabled={isDepositing || !amount || Number(amount) <= 0}
            onClick={() => void deposit(amount)}
            className="flex-1 rounded-[4px] bg-[#fff7cf] px-3 py-1.5 text-xs font-semibold text-[#050505] transition hover:opacity-90 disabled:opacity-50"
          >
            {isDepositing ? "Dépôt en cours…" : `Déposer ${amount} UNLINK`}
          </button>
        </div>
      )}

      {depositError && (
        <div className="mt-2 flex items-start gap-1.5 rounded-[4px] border border-[#ff7777]/30 bg-[#ff7777]/10 p-2 text-xs text-[#ff7777]">
          <span className="shrink-0">Erreur :</span>
          <span className="break-all">{depositError}</span>
        </div>
      )}
    </div>
  );
}
