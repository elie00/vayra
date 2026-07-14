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
