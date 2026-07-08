"use client";

import { Check, Upload } from "@phosphor-icons/react";
import { ArrowUpRight, Disc3, ExternalLink, Tag, X } from "lucide-react";
import { echoConfig } from "@/lib/config";
import type { SoundCloudPublishState } from "@/lib/services/soundcloud";
import type { EchoFlowStatus } from "@/lib/types";

type ArtistControlsProps = {
  flowStatus?: EchoFlowStatus;
  hasRegistrySeal: boolean;
  isCleanAndSealed: boolean;
  certificateTrackId?: `0x${string}`;
  isRevealing: boolean;
  onReveal: () => void;
  canPublishToSoundCloud: boolean;
  soundCloudPublish: SoundCloudPublishState;
  onPublishToSoundCloud: () => void;
  onOpenSellModal: () => void;
};

export function ArtistControls({
  flowStatus,
  hasRegistrySeal,
  isCleanAndSealed,
  certificateTrackId,
  isRevealing,
  onReveal,
  canPublishToSoundCloud,
  soundCloudPublish,
  onPublishToSoundCloud,
  onOpenSellModal,
}: ArtistControlsProps) {
  const isBlocked = flowStatus === "pipeline_blocked";
  const checklist = [
    isBlocked ? "Seal execution cancelled" : "SEALED entry is private",
    hasRegistrySeal ? "Report linked to backend registry record" : "Certificate waits for Registry tx",
    "Reveal requires wallet signature",
  ];

  return (
    <div className="rounded-[8px] border border-white/15 bg-[#080808] p-6 sm:p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-white/45">Reveal queue</p>
          <h3 className="mt-1 font-display text-3xl font-black">Artist controls</h3>
        </div>
        <Disc3 className="echo-disc-idle size-10 text-[#8fd5ff]" aria-hidden="true" />
      </div>
      <div className="space-y-3">
        {checklist.map((item) => (
          <div className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 px-4" key={item}>
            <span className={`grid size-7 place-items-center rounded-full text-[#050505] ${isBlocked ? "bg-[#ff7777]" : "bg-[#9ef7c9]"}`}>
              {isBlocked ? <X className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            </span>
            <span className="font-bold text-white/75">{item}</span>
          </div>
        ))}
      </div>
      <button
        className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#8fd5ff] px-5 font-black text-[#050505] transition hover:bg-[#b8e5ff] disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!hasRegistrySeal || !certificateTrackId || isRevealing}
        onClick={onReveal}
        type="button"
      >
        {isRevealing ? "Revealing..." : "Reveal track"}
        <ArrowUpRight className="size-5" aria-hidden="true" />
      </button>

      <div className="mt-6 border-t border-white/10 pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase text-white/45">Release</p>
            <h4 className="mt-1 font-display text-2xl font-black">SoundCloud</h4>
          </div>
          <Upload className="size-8 text-[#f59abd]" aria-hidden="true" />
        </div>

        {isCleanAndSealed ? (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f59abd] px-5 font-black text-[#050505] transition hover:bg-[#ffb1ce] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canPublishToSoundCloud}
            onClick={onPublishToSoundCloud}
            type="button"
          >
            {soundCloudPublish.status === "publishing" ? "Publishing..." : "Publish to SoundCloud"}
            <ArrowUpRight className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <p className="rounded-[8px] border border-white/10 px-4 py-3 text-sm font-bold text-white/55">
            SoundCloud publish unlocks after a CLEAN seal.
          </p>
        )}

        <div className="mt-4 min-h-6" aria-live="polite">
          {soundCloudPublish.status === "published" ? (
            <a
              className="inline-flex items-center gap-2 text-sm font-black text-[#9ef7c9] transition hover:text-white"
              href={soundCloudPublish.response.soundcloud_url}
              target="_blank"
              rel="noreferrer"
            >
              Published on SoundCloud
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          ) : soundCloudPublish.status === "error" ? (
            <p className="text-sm font-bold text-[#ff7777]">{soundCloudPublish.error}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase text-white/45">Licensing</p>
            <h4 className="mt-1 font-display text-2xl font-black">Sell my rights</h4>
          </div>
          <Tag className="size-8 text-[#fff7cf]" aria-hidden="true" />
        </div>

        {isCleanAndSealed && certificateTrackId ? (
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#fff7cf] px-5 font-black text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!echoConfig.escrowAddress}
            onClick={onOpenSellModal}
            type="button"
          >
            <Tag className="size-5" aria-hidden="true" />
            {echoConfig.escrowAddress ? "List for sale" : "Escrow not deployed"}
          </button>
        ) : (
          <p className="rounded-[8px] border border-white/10 px-4 py-3 text-sm font-bold text-white/55">
            Rights sales unlock after a CLEAN Network seal.
          </p>
        )}
      </div>
    </div>
  );
}
