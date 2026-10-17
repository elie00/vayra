import type { ScoredStream } from "@/lib/streams/types";

/** How far into an episode the next one starts being prepared. */
const NEAR_END_SHARE = 0.85;
/** Torrents to prepare: the first candidates, without guessing autoplay's exact pick. */
const PREWARMED_TORRENTS = 2;

export function nearEnd(positionSec: number, durationSec: number): boolean {
  return durationSec > 0 && positionSec >= durationSec * NEAR_END_SHARE;
}

/**
 * The first sources of the next episode the engine would download itself: torrents
 * with no direct link and no debrid holding them. Adding them ahead, paused, fetches
 * their metadata, which a torrent stream otherwise waits for when it opens.
 */
export function torrentsToPrewarm(all: readonly ScoredStream[]): ScoredStream[] {
  const seen = new Set<string>();
  const out: ScoredStream[] = [];
  for (const s of all) {
    if (!s.infoHash || s.url || Object.values(s.cached ?? {}).some(Boolean)) continue;
    const hash = s.infoHash.toLowerCase();
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(s);
    if (out.length === PREWARMED_TORRENTS) break;
  }
  return out;
}
