import { useMemo } from "react";
import { getEpisodeProgress } from "@/lib/episode-progress";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { lastPlayedEpisode } from "@/lib/resume";
import { animeSeasonKey } from "./anime-season-key";

export function useAnimePreferredSeason({
  episodes,
  metaId,
  traktWatched,
  anilistWatched,
  malWatched,
  mwVersion,
}: {
  episodes: KitsuEpisode[];
  metaId: string;
  traktWatched: Set<string>;
  anilistWatched?: Set<string>;
  malWatched?: Set<string>;
  mwVersion: number;
}): string | null {
  return useMemo(() => {
    if (episodes.length === 0) return null;
    let maxSeason = 1;
    for (const ep of episodes) {
      const isCurrent = ep.sourceMetaId == null;
      const progress = getEpisodeProgress(
        ep.sourceMetaId ?? metaId,
        animeSeasonKey(ep),
        ep.number,
        ep.length ?? null,
        ep.imdbId ?? null,
        traktWatched,
        undefined,
        isCurrent ? anilistWatched : undefined,
        undefined,
        isCurrent ? malWatched : undefined,
        ep.imdbSeason,
        ep.imdbEpisode,
      );
      const seasonNo = ep.imdbSeason ?? ep.seasonNumber ?? 1;
      if (seasonNo > maxSeason) maxSeason = seasonNo;
      if (!progress.watched) return String(seasonNo);
    }
    const played = lastPlayedEpisode(metaId);
    if (played != null) {
      const ep = episodes.find((e) => e.number === played.episode);
      const seasonNo = ep?.imdbSeason ?? ep?.seasonNumber;
      if (seasonNo != null) return String(seasonNo);
    }
    return String(maxSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, metaId, traktWatched, anilistWatched, malWatched, mwVersion]);
}
