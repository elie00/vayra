import type { PlayEpisode } from "@/lib/view";

/**
 * Fill in each episode's position counted from the series' first episode — how
 * long-running shows are released, and how a batch names its files. Specials
 * (season 0) never take part in that count.
 *
 * A season's length is taken from its highest episode number rather than from how
 * many episodes the list holds, so a gap in one season does not shift every later
 * season by one.
 */
export function withAbsoluteEpisodes(eps: PlayEpisode[]): PlayEpisode[] {
  const lastOfSeason = new Map<number, number>();
  for (const ep of eps) {
    if (ep.season < 1 || ep.episode < 1) continue;
    const cur = lastOfSeason.get(ep.season) ?? 0;
    if (ep.episode > cur) lastOfSeason.set(ep.season, ep.episode);
  }

  const offsets = new Map<number, number>();
  let running = 0;
  for (const season of [...lastOfSeason.keys()].sort((a, b) => a - b)) {
    offsets.set(season, running);
    running += lastOfSeason.get(season) ?? 0;
  }

  return eps.map((ep) => {
    if (ep.absoluteEpisode != null) return ep;
    const offset = offsets.get(ep.season) ?? 0;
    if (offset === 0 || ep.episode < 1) return ep;
    return { ...ep, absoluteEpisode: offset + ep.episode };
  });
}
