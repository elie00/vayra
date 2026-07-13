import { useSyncExternalStore } from "react";
import { activeProfileId } from "@/lib/active-profile-id";
import type { Meta } from "@/lib/cinemeta";
import {
  lumaQueueKey,
  lumaStore,
  type LumaAuthority,
  type LumaQueueItem,
  type LumaResult,
} from "@/lib/luma";
import type { PlayEpisode } from "@/lib/view";

export type QueueItem = {
  id: string;
  meta: Meta;
  episode?: PlayEpisode;
  addedAt: number;
};

const SLEEP_KEY = "harbor.queue.sleepAtEnd.v1";
const sleepListeners = new Set<() => void>();

function fromLuma(item: LumaQueueItem): QueueItem {
  const episode = item.ref.episode
    ? {
        season: item.ref.episode.season,
        episode: item.ref.episode.episode,
        ...(item.ref.episode.canonicalVideoId ? { videoId: item.ref.episode.canonicalVideoId } : {}),
        ...(item.presentation.episodeTitle ? { name: item.presentation.episodeTitle } : {}),
      }
    : undefined;
  return {
    id: item.id,
    meta: {
      id: item.ref.kind === "catalog" ? item.ref.metaId : `local:${item.ref.entryId}`,
      type: item.ref.mediaType,
      name: item.presentation.title,
      ...(item.presentation.artwork ? { poster: item.presentation.artwork, background: item.presentation.artwork } : {}),
    },
    ...(episode ? { episode } : {}),
    addedAt: item.addedAt,
  };
}

export function queueAdd(meta: Meta, episode?: PlayEpisode): void {
  lumaStore().add({ meta, episode });
}

export function queueRemove(id: string): void {
  lumaStore().remove(id);
}

export function queueToggle(meta: Meta, episode?: PlayEpisode): void {
  lumaStore().toggle({ meta, episode });
}

export function queueClear(): void {
  lumaStore().clearQueue();
}

export function queueReorder(orderedIds: string[]): void {
  lumaStore().reorder(orderedIds);
}

/**
 * Reserves, but does not remove, the first LUMA item. The player must call
 * queueAcknowledgeStarted after a frame is rendered so source failures never
 * destroy a user's queue entry.
 */
export function queueBeginNext(authority: LumaAuthority): LumaResult<QueueItem> {
  const result = lumaStore().beginNext(authority);
  return result.ok ? { ok: true, value: fromLuma(result.value) } : result;
}

export function queueShift(): QueueItem | null {
  const result = queueBeginNext("solo");
  return result.ok ? result.value : null;
}

export function queueAcknowledgeStarted(id: string): void {
  lumaStore().acknowledgeStarted(id);
}

export function queueRejectStart(message?: string): void {
  lumaStore().rejectStart(message);
}

export function useQueue(): QueueItem[] {
  const store = lumaStore(activeProfileId());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return snapshot.document.queue.map(fromLuma);
}

export function useIsQueued(meta: Meta, episode?: PlayEpisode): boolean {
  const queue = useQueue();
  const key = lumaQueueKey(meta, episode);
  if (!key) return false;
  return queue.some((item) => lumaQueueKey(item.meta, item.episode) === key);
}

export function getSleepAtEnd(): boolean {
  try {
    return localStorage.getItem(SLEEP_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSleepAtEnd(on: boolean): void {
  try {
    if (on) localStorage.setItem(SLEEP_KEY, "1");
    else localStorage.removeItem(SLEEP_KEY);
  } catch {
    /* compatibility setting remains best-effort */
  }
  for (const listener of sleepListeners) listener();
}

export function useSleepAtEnd(): boolean {
  return useSyncExternalStore(
    (listener) => {
      sleepListeners.add(listener);
      return () => sleepListeners.delete(listener);
    },
    getSleepAtEnd,
    getSleepAtEnd,
  );
}
