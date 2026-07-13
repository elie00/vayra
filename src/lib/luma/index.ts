import { useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import { lumaQueueKey, lumaStore } from "./store";

export * from "./types";
export * from "./authority";
export { LumaStore, lumaQueueKey, lumaStore } from "./store";
export { lumaBackupKey, lumaInput, lumaStorageKey } from "./storage";

export function useLuma(profileId?: string) {
  const store = lumaStore(profileId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useIsInLuma(meta: Meta, episode?: PlayEpisode, profileId?: string): boolean {
  const snapshot = useLuma(profileId);
  const key = lumaQueueKey(meta, episode);
  return Boolean(key && snapshot.document.queue.some((item) => {
    const itemKey = item.ref.kind === "catalog"
      ? `catalog:${item.ref.metaId}${item.ref.episode ? `:${item.ref.episode.season}:${item.ref.episode.episode}` : ""}`
      : `local:${item.ref.entryId}${item.ref.episode ? `:${item.ref.episode.season}:${item.ref.episode.episode}` : ""}`;
    return itemKey === key;
  }));
}
