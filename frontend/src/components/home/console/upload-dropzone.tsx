"use client";

import { useState, type ChangeEvent } from "react";
import { Upload } from "@phosphor-icons/react";

type UploadDropzoneProps = {
  audioName: string;
  onFile: (file: File) => void | Promise<void>;
};

export function UploadDropzone({ audioName, onFile }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const selectedLabel = audioName || "Drop WAV / MP3";

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onFile(file);
  }

  return (
    <label
      className={`group block cursor-pointer rounded-[8px] border transition-all duration-200 p-6 ${isDragging
        ? "border-solid border-[#f59abd] bg-[#f59abd]/10 scale-[1.01]"
        : "border-dashed border-white/25 bg-white/[0.03] hover:border-[#f59abd] hover:bg-[#f59abd]/10"
        }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          await onFile(file);
        }
      }}
    >
      <input
        className="sr-only"
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3"
        onChange={handleSelect}
        suppressHydrationWarning
      />
      <span className="flex min-h-48 flex-col justify-between gap-8">
        <span className="flex items-start justify-between gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
            <Upload className="size-6" aria-hidden="true" />
          </span>
          <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/60">WAV / MP3</span>
        </span>
        <span>
          <span className="block break-words font-display text-4xl font-black text-white">
            {isDragging ? "Drop your track here!" : selectedLabel}
          </span>
          <span className="mt-3 block text-base text-white/55">
            {isDragging ? "Release to begin hashing" : "Client-side encrypted audio, then confidential comparison."}
          </span>
        </span>
      </span>
    </label>
  );
}
