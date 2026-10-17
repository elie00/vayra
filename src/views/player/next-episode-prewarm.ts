import type { ScoredStream } from "@/lib/streams/types";
import type { PlayerStreamRef } from "@/lib/view";

/** How far into an episode the next one starts being prepared: halfway leaves time for a slow lookup. */
const PREWARM_FROM_SHARE = 0.5;

export function prewarmDue(positionSec: number, durationSec: number): boolean {
  return durationSec > 0 && positionSec >= durationSec * PREWARM_FROM_SHARE;
}

/** The next episode from the same source: the add-on's binge group, else the same add-on, resolution and source. */
function sameSource(s: ScoredStream, playing: PlayerStreamRef): boolean {
  const binge = s.behaviorHints?.bingeGroup ?? null;
  if (playing.bingeGroup && binge) return binge === playing.bingeGroup;
  return !!playing.addonId && s.addonId === playing.addonId && s.resolution === playing.resolution && s.source === playing.source;
}

/**
 * The next episode's torrent from the source this one plays from, preferring the
 * same release group, for the engine to add ahead, paused: its metadata is then
 * there when it plays. Nothing when no source matches, rather than one at random;
 * nothing either for a season pack (already in the engine), a debrid-cached or a
 * direct link (the engine would not download them).
 */
export function torrentToPrewarm(all: readonly ScoredStream[], playing: PlayerStreamRef | undefined): ScoredStream | null {
  if (!playing) return null;
  const playingHash = playing.infoHash?.toLowerCase() ?? null;
  const engineTorrent = (s: ScoredStream) =>
    !!s.infoHash && !s.url && !Object.values(s.cached ?? {}).some(Boolean);
  const matches = all.filter((s) => sameSource(s, playing));
  const best = matches.find((s) => !!playing.releaseGroup && s.releaseGroup === playing.releaseGroup) ?? matches[0];
  if (!best || !engineTorrent(best) || best.infoHash!.toLowerCase() === playingHash) return null;
  return best;
}
