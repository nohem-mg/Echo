"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletCards } from "lucide-react";
import { sepolia } from "wagmi/chains";

const TONE_CLASSES = {
  header: "inline-flex h-11 items-center gap-2 rounded-full bg-[#fff7cf] px-5 font-bold text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50",
  panel: "inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/15 px-5 font-black text-white transition hover:border-[#8fd5ff] hover:text-[#8fd5ff] disabled:cursor-not-allowed disabled:opacity-50",
} as const;

export function WalletConnectControl({ tone }: { tone: keyof typeof TONE_CLASSES }) {
  const className = TONE_CLASSES[tone];

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && account && chain;

        if (!mounted) {
          return (
            <button className={className} disabled type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Connect wallet
            </button>
          );
        }

        if (!connected) {
          return (
            <button className={className} onClick={openConnectModal} type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported || chain.id !== sepolia.id) {
          return (
            <button className={className} onClick={openChainModal} type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Wrong network
            </button>
          );
        }

        return (
          <button className={className} onClick={openAccountModal} type="button">
            <WalletCards className="size-4" aria-hidden="true" />
            {tone === "header" ? account.displayName : `Sepolia · ${account.displayName}`}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
