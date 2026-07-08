"use client";

import { useEffect, useRef } from "react";
import { FileAudio } from "lucide-react";
import { echoSounds } from "@/lib/sound-design";

export function VinylVisual({ isPlaying }: { isPlaying: boolean }) {
  const vinylHoverRef = useRef(false);

  useEffect(() => {
    if (isPlaying && vinylHoverRef.current) {
      vinylHoverRef.current = false;
      echoSounds.vinylHoverStop();
    }
  }, [isPlaying]);

  useEffect(() => () => {
    if (vinylHoverRef.current) {
      vinylHoverRef.current = false;
      echoSounds.vinylHoverStop();
    }
  }, []);

  function beginVinylHoverFromPointer() {
    if (isPlaying || vinylHoverRef.current || !echoSounds.hasUserInteracted()) {
      return;
    }

    vinylHoverRef.current = true;

    if (echoSounds.isAudioRunning()) {
      void echoSounds.vinylHoverStart();
    }
  }

  function handleVinylPointerDown() {
    if (isPlaying) {
      return;
    }

    vinylHoverRef.current = true;
    echoSounds.vinylHoverStartFromUserGesture();
  }

  function handleVinylPointerEnter() {
    beginVinylHoverFromPointer();
  }

  function handleVinylPointerLeave() {
    if (!vinylHoverRef.current) {
      return;
    }
    vinylHoverRef.current = false;
    echoSounds.vinylHoverStop();
  }

  return (
    <div
      className="absolute inset-0 grid cursor-pointer place-items-center"
      onPointerDown={handleVinylPointerDown}
      onPointerEnter={handleVinylPointerEnter}
      onPointerLeave={handleVinylPointerLeave}
      title={
        echoSounds.isMuted()
          ? "Enable sounds with the header volume button"
          : echoSounds.hasUserInteracted()
            ? "Hover for ambient vinyl sound"
            : "Click once to activate vinyl sound"
      }
    >
      <div
        className={`vinyl relative size-full rounded-full border border-white/20 bg-[#111] ${isPlaying ? "vinyl-spin-fast" : "vinyl-spin-idle"}`}
      >
        <div className="vinyl-shimmer vinyl-shimmer-spin absolute inset-0 rounded-full" aria-hidden="true" />
        <div className="echo-groove-pulse absolute inset-[8%] rounded-full border border-white/10" style={{ animationDelay: "0s" }} />
        <div className="echo-groove-pulse absolute inset-[18%] rounded-full border border-white/10" style={{ animationDelay: "0.8s" }} />
        <div className="echo-groove-pulse absolute inset-[30%] rounded-full border border-white/10" style={{ animationDelay: "1.6s" }} />
        <div className="vinyl-label-pulse absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
          <FileAudio className="size-9" aria-hidden="true" />
        </div>
      </div>
      <svg className="pointer-events-none absolute -right-6 top-8 h-44 w-40 text-[#fff7cf]" viewBox="0 0 180 190" fill="none" aria-hidden="true">
        <g className="vinyl-note">
          <path d="M144 18C127 53 120 75 124 102C128 130 118 151 88 168" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
          <path d="M87 168C59 184 28 171 23 146C19 126 33 111 55 111C79 111 94 132 88 168Z" fill="currentColor" />
        </g>
        <g className="vinyl-sparkle">
          <path d="M27 46L51 58L27 70L15 94L3 70L-21 58L3 46L15 22L27 46Z" fill="currentColor" transform="translate(38 10)" />
        </g>
      </svg>
    </div>
  );
}
