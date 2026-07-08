"use client";

import Image from "next/image";
import { SpeakerHigh, SpeakerX } from "@phosphor-icons/react";
import { WalletConnectControl } from "@/components/common/wallet-connect-control";

type SiteHeaderProps = {
  sfxEnabled: boolean;
  onToggleSfx: () => void;
};

export function SiteHeader({ sfxEnabled, onToggleSfx }: SiteHeaderProps) {
  const sfxLabel = sfxEnabled ? "Mute interface sounds" : "Enable interface sounds";

  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#050505]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a className="flex items-center gap-3" href="#top" aria-label="Echo home">
          <Image src="/logo.jpeg" alt="Echo logo" className="size-10 rounded-full object-cover" width={40} height={40} />
          <span className="font-display text-xl font-black">Echo</span>
        </a>
        <div className="hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-sm text-white/70 md:flex">
          <span className="rounded-full border border-white/15 px-4 py-2">ETH GLOBAL NYC 2026</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-[#f59abd] hover:text-[#f59abd]"
            data-echo-silent
            onClick={onToggleSfx}
            aria-label={sfxLabel}
            title={sfxLabel}
          >
            {sfxEnabled ? <SpeakerHigh className="size-4" aria-hidden="true" /> : <SpeakerX className="size-4" aria-hidden="true" />}
          </button>
          <WalletConnectControl tone="header" />
        </div>
      </div>
    </div>
  );
}
