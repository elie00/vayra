import type { Episode, Season } from "@/lib/providers/tmdb";
import { tvdbEpisodesByType, tvdbSeriesByImdb } from "./tvdb";

export type TvdbOrder = { seasons: Season[]; bySeason: Map<number, Episode[]> };

const orderCache = new Map<string, TvdbOrder | null>();

export async function fetchTvdbOrder(
  apiKey: string,
  imdbId: string,
  seasonType: string,
): Promise<TvdbOrder | null> {
  if (!apiKey || !imdbId.startsWith("tt") || seasonType === "default") return null;
  const cacheKey = `${imdbId}:${seasonType}`;
  if (orderCache.has(cacheKey)) return orderCache.get(cacheKey) ?? null;
  const result = await build(apiKey, imdbId, seasonType).catch(() => null);
  orderCache.set(cacheKey, result);
  return result;
}

async function build(
  apiKey: string,
  imdbId: string,
  seasonType: string,
): Promise<TvdbOrder | null> {
  const seriesId = await tvdbSeriesByImdb(apiKey, imdbId);
  if (!seriesId) return null;
  const [defaultEps, altEps] = await Promise.all([
    tvdbEpisodesByType(apiKey, seriesId, "default"),
    tvdbEpisodesByType(apiKey, seriesId, seasonType),
  ]);
  if (altEps.length === 0) return null;

  const canonical = new Map<number, { season: number; episode: number }>();
  for (const e of defaultEps) {
    if (e.seasonNumber >= 1) canonical.set(e.id, { season: e.seasonNumber, episode: e.number });
  }

  const bySeason = new Map<number, Episode[]>();
  for (const e of altEps) {
    const c = canonical.get(e.id);
    if (!c) continue;
    const bucket = bySeason.get(e.seasonNumber) ?? [];
    bucket.push({
      id: e.id,
      seasonNumber: c.season,
      episodeNumber: c.episode,
      name: e.name ?? "",
      overview: e.overview ?? "",
      stillPath: null,
      airDate: e.aired ?? null,
      runtime: e.runtime ?? null,
      voteAverage: null,
    });
    bySeason.set(e.seasonNumber, bucket);
  }
  if (bySeason.size === 0) return null;

  const seasons: Season[] = [...bySeason.keys()]
    .sort((a, b) => a - b)
    .map((n) => ({
      id: n,
      seasonNumber: n,
      name: n === 0 ? "Specials" : `Season ${n}`,
      overview: "",
      posterPath: null,
      episodeCount: bySeason.get(n)!.length,
      airDate: bySeason.get(n)![0]?.airDate ?? null,
    }));
  return { seasons, bySeason };
}
