"use client";

import Image from "next/image";
import { ArrowUpRight, QrCode as QrCodeIcon, X } from "lucide-react";
import type { WorldQrState } from "@/lib/services/world-id";

type WorldIdQrModalProps = WorldQrState & {
  onClose: () => void;
};

export function WorldIdQrModal({ connectorURI, imageDataUrl, onClose }: WorldIdQrModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/78 px-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="world-id-title">
      <div className="relative w-full max-w-[440px] rounded-[8px] border border-white/15 bg-[#050505] p-5 text-[#f8f6ee] shadow-2xl sm:p-6">
        <button
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-[#f59abd] hover:text-[#f59abd]"
          onClick={onClose}
          type="button"
          aria-label="Close World ID QR"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-12">
          <span className="grid size-12 place-items-center rounded-full bg-[#fff7cf] text-[#050505]">
            <QrCodeIcon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm uppercase text-white/45">World ID</p>
            <h2 id="world-id-title" className="font-display text-2xl font-black">
              Scan with World App
            </h2>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#fff7cf]/40 bg-[#fff7cf] p-4">
          <Image
            className="mx-auto aspect-square w-full max-w-[320px]"
            src={imageDataUrl}
            alt="World ID verification QR code"
            width={320}
            height={320}
            unoptimized
          />
        </div>

        <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
          Open World App, scan this code, then approve the proof. Echo will continue automatically once the proof is returned.
        </div>

        <a
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f59abd] px-5 font-black text-[#050505] transition hover:bg-[#ffb1ce]"
          href={connectorURI}
          rel="noreferrer"
          target="_blank"
        >
          Open World App
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
