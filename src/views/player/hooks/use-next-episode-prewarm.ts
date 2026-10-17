import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import { peekPickerCache, subscribePickerCache } from "@/lib/picker-cache";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { prewarmLocalEngine } from "@/lib/streams/resolve";
import type { PlayEpisode, PlayerStreamRef } from "@/lib/view";
import { useSwitcherRefresh } from "@/components/player/stream-switcher/use-switcher-refresh";
import { prewarmDue, torrentToPrewarm } from "../next-episode-prewarm";

/**
 * Halfway through an episode, look up the next one's sources and have the engine
 * preload the start of the torrent from the source this one plays from. Going on
 * then finds the list ready and the first minute there, instead of starting both
 * from scratch.
 */
export function useNextEpisodePrewarm(params: {
  meta: Meta;
  nextEp: PlayEpisode | null;
  /** The source this episode plays from. */
  playing: PlayerStreamRef | undefined;
  imdbId: string | null;
  durationSec: number;
  enabled: boolean;
}) {
  const { meta, nextEp, playing, imdbId, durationSec, enabled } = params;
  const due = usePlaybackFlag(() => prewarmDue(getPlaybackPosition(), durationSec));
  const active = enabled && !!nextEp && due;
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
    const stream = torrentToPrewarm(entry.result.picker.all, playing);
    if (stream) void prewarmLocalEngine(stream, { season: nextEp.season, episode: nextEp.episode, absolute: nextEp.absoluteEpisode ?? null });
  }, [active, entry, meta.id, nextEp, playing]);
}
