"use client";

import { useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import type { HistoryEntry } from "@/lib/hooks/use-flow-history";

const VERDICT_BADGES: Record<string, { label: string; cls: string }> = {
  CLEAN: { label: "CLEAN", cls: "bg-[#9ef7c9]/15 text-[#9ef7c9]" },
  SIMILAR: { label: "SIMILAR", cls: "bg-[#ffd166]/15 text-[#ffd166]" },
  REJECTED: { label: "REJECTED", cls: "bg-[#ff7777]/15 text-[#ff7777]" },
};

const IN_PROGRESS_BADGE = { label: "In progress", cls: "bg-white/10 text-white/50" };

type FlowHistoryPanelProps = {
  entries: HistoryEntry[];
  onRestore: (flowId: string) => void;
};

export function FlowHistoryPanel({ entries, onRestore }: FlowHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-[8px] border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-white/60 hover:text-white/90 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <Clock className="size-4" />
          My tracks {entries.length > 0 ? `(${entries.length})` : ""}
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        entries.length === 0 ? (
          <p className="border-t border-white/10 px-4 py-4 text-sm text-white/35">
            No tracks yet — complete a verification to see your history here.
          </p>
        ) : (
          <ul className="border-t border-white/10 divide-y divide-white/5">
            {entries.map((entry) => {
              const badge = (entry.verdict && VERDICT_BADGES[entry.verdict]) || IN_PROGRESS_BADGE;
              const date = new Date(entry.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return (
                <li key={entry.flowId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white/85">{entry.trackName}</p>
                    <p className="text-xs text-white/40">{date}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
                    <button
                      type="button"
                      className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70 hover:border-[#f59abd] hover:text-[#f59abd] transition-colors"
                      onClick={() => {
                        setOpen(false);
                        onRestore(entry.flowId);
                      }}
                    >
                      Resume
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
