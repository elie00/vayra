import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import { peekPickerCache, subscribePickerCache } from "@/lib/picker-cache";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { prewarmLocalEngine } from "@/lib/streams/resolve";
import type { PlayEpisode } from "@/lib/view";
import { useSwitcherRefresh } from "@/components/player/stream-switcher/use-switcher-refresh";
import { nearEnd, torrentsToPrewarm } from "../next-episode-prewarm";

/**
 * Near the end of an episode, look up the next one's sources and add its first
 * torrents to the engine, paused. Going on then finds the list ready and the
 * metadata fetched, instead of starting both from scratch.
 */
export function useNextEpisodePrewarm(params: {
  meta: Meta;
  nextEp: PlayEpisode | null;
  imdbId: string | null;
  durationSec: number;
  enabled: boolean;
}) {
  const { meta, nextEp, imdbId, durationSec, enabled } = params;
  const near = usePlaybackFlag(() => nearEnd(getPlaybackPosition(), durationSec));
  const active = enabled && !!nextEp && near;
  useSwitcherRefresh({ meta, episode: nextEp ?? undefined, imdbId, active });

  const entry = useSyncExternalStore(subscribePickerCache, () =>
    active && nextEp ? peekPickerCache(meta, nextEp) : null,
  );
  const warmedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !nextEp || !entry?.complete) return;
    const key = `${meta.id}|s${nextEp.season}e${nextEp.episode}`;
    if (warmedRef.current === key) return;
    warmedRef.current = key;
    for (const stream of torrentsToPrewarm(entry.result.picker.all)) void prewarmLocalEngine(stream);
  }, [active, entry, meta.id, nextEp]);
}
