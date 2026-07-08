"use client";

import { LockKeyhole } from "lucide-react";
import { VinylVisual } from "@/components/home/hero/vinyl-visual";

export function HeroPanel({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="order-2 relative min-h-[640px] overflow-hidden rounded-[8px] border border-white/15 bg-black px-5 py-6 sm:px-8 lg:order-1 lg:px-10">
      <div className="halftone echo-halftone pointer-events-none absolute -left-24 top-16 size-80 opacity-45" aria-hidden="true" />
      <div className="echo-starburst absolute right-8 top-8 z-10 hidden rotate-6 bg-[#fff7cf] px-6 py-5 text-center text-[#050505] starburst sm:block">
        <span className="font-hand text-lg">3 seals free</span>
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-10">
        <div>
          <h1 className="max-w-4xl font-display text-[clamp(4rem,13vw,12rem)] font-black leading-[0.78] text-[#f59abd]">
            Echo
          </h1>
          <p className="mt-8 max-w-3xl font-serif text-[clamp(2.35rem,5vw,5.6rem)] leading-[0.94] text-white">
            Seal the track before the world hears it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_0.8fr] sm:items-end">
          <div className="rounded-[8px] border border-white/15 bg-[#080808] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="echo-hand-float font-hand text-2xl text-[#fff7cf]">private until reveal</span>
              <LockKeyhole className="echo-lock-nudge size-5 text-[#f59abd]" aria-hidden="true" />
            </div>
            <p className="max-w-xl text-lg leading-7 text-white/72">
              Upload your track, run a confidential plagiarism check, and seal a prior-art proof on-chain. Reveal it publicly whenever you&apos;re ready.
            </p>
          </div>

          <div className="relative z-20 mx-auto aspect-square w-full max-w-[280px]">
            <VinylVisual isPlaying={isPlaying} />
          </div>
        </div>
      </div>
    </div>
  );
}
