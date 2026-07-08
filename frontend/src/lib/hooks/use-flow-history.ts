import { useCallback, useSyncExternalStore } from "react";
import type { EchoFlow } from "@/lib/types";

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
const EMPTY_ENTRIES: HistoryEntry[] = [];

let cachedKey: string | null = null;
let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = EMPTY_ENTRIES;

function storageKey(address: string) {
  return `echo_history_${address.toLowerCase()}`;
}

function historyEventKey(address: string) {
  return `${storageKey(address)}_updated`;
}

function readStoredEntries(address: string | undefined) {
  if (!address || typeof window === "undefined") {
    return EMPTY_ENTRIES;
  }

  const key = storageKey(address);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {}

  if (cachedKey === key && cachedRaw === raw) {
    return cachedEntries;
  }

  try {
    cachedEntries = raw ? (JSON.parse(raw) as HistoryEntry[]) : EMPTY_ENTRIES;
  } catch {
    cachedEntries = EMPTY_ENTRIES;
  }
  cachedKey = key;
  cachedRaw = raw;
  return cachedEntries;
}

function writeStoredEntries(address: string, entries: HistoryEntry[]) {
  const key = storageKey(address);
  const raw = JSON.stringify(entries);
  cachedKey = key;
  cachedRaw = raw;
  cachedEntries = entries;

  try {
    window.localStorage.setItem(key, raw);
  } catch {}
  window.dispatchEvent(new Event(historyEventKey(address)));
}

export function useFlowHistory(address: string | undefined) {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!address || typeof window === "undefined") {
      return () => {};
    }

    const key = storageKey(address);
    const localEventKey = historyEventKey(address);
    const handleLocalUpdate = () => onStoreChange();
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key === key) {
        onStoreChange();
      }
    };

    window.addEventListener("storage", handleStorageUpdate);
    window.addEventListener(localEventKey, handleLocalUpdate);
    return () => {
      window.removeEventListener("storage", handleStorageUpdate);
      window.removeEventListener(localEventKey, handleLocalUpdate);
    };
  }, [address]);

  const getSnapshot = useCallback(() => readStoredEntries(address), [address]);
  const getServerSnapshot = useCallback(() => EMPTY_ENTRIES, []);
  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addOrUpdate = useCallback(
    (flow: EchoFlow) => {
      if (!address || typeof window === "undefined") return;
      const entry: HistoryEntry = {
        flowId: flow.id,
        trackName: flow.trackName,
        status: flow.status,
        verdict: flow.report?.verdict,
        registryTxHash: flow.registryTxHash,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      };
      const without = readStoredEntries(address).filter((e) => e.flowId !== flow.id);
      writeStoredEntries(address, [entry, ...without].slice(0, MAX_ENTRIES));
    },
    [address],
  );

  return { entries, addOrUpdate };
}
