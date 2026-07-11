import { meta as fetchMeta } from "@/lib/cinemeta";
import { tmdbLiteMeta } from "@/lib/providers/tmdb/tmdb-lite";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import type { TopTitle } from "./types";

const isAnimeId = (id: string) => /^(kitsu|mal|anilist|anidb|simkl):/.test(id);

export async function enrichTopTitles(
  titles: TopTitle[],
  tmdbKey: string,
): Promise<{
  genres: Array<{ genre: string; count: number }>;
  posters: Record<string, string>;
}> {
  const targets = titles.slice(0, 15);
  if (targets.length === 0) return { genres: [], posters: {} };
  const counts = new Map<string, number>();
  const posters: Record<string, string> = {};
  await Promise.all(
    targets.map(async (t) => {
      try {
        if (isAnimeId(t.id)) {
          const m = await animeKitsuMeta(t.id);
          if (m?.poster) posters[t.id] = m.poster;
          return;
        }
        if (t.id.startsWith("tmdb:")) {
          const m = await tmdbLiteMeta(tmdbKey, t.id);
          if (m?.poster) posters[t.id] = m.poster;
          return;
        }
        if (t.id.startsWith("tt")) {
          const m = await fetchMeta(t.type === "movie" ? "movie" : "series", t.id);
          if (m?.poster) posters[t.id] = m.poster;
          for (const g of m?.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + t.count);
        }
      } catch {
        /* skip */
      }
    }),
  );
  const genres = [...counts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return { genres, posters };
}
