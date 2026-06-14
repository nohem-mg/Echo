import { useCallback, useEffect, useState } from "react";
import type { EchoFlow } from "./types";

export type HistoryEntry = {
  flowId: string;
  trackName: string;
  status: EchoFlow["status"];
  verdict?: "CLEAN" | "SIMILAR" | "REJECTED";
  registryTxHash?: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_ENTRIES = 20;

function storageKey(address: string) {
  return `echo_history_${address.toLowerCase()}`;
}

export function useFlowHistory(address: string | undefined) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!address) {
      setEntries([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(address));
      setEntries(raw ? (JSON.parse(raw) as HistoryEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, [address]);

  const addOrUpdate = useCallback(
    (flow: EchoFlow) => {
      if (!address) return;
      setEntries((prev) => {
        const entry: HistoryEntry = {
          flowId: flow.id,
          trackName: flow.trackName,
          status: flow.status,
          verdict: flow.report?.verdict,
          registryTxHash: flow.registryTxHash,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
        };
        const without = prev.filter((e) => e.flowId !== flow.id);
        const next = [entry, ...without].slice(0, MAX_ENTRIES);
        try {
          localStorage.setItem(storageKey(address), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [address],
  );

  return { entries, addOrUpdate };
}
