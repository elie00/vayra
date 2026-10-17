import type { Meta } from "@/lib/cinemeta";
import { safeFetch } from "@/lib/safe-fetch";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
/** TMDB does not say when a title reached a service: recent releases and recently
 *  aired episodes (new seasons included) stand in for it. */
const WINDOW_DAYS = 60;
const MAX = 20;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function newReleasesParams(
  kind: "movie" | "tv",
  key: string,
  providerIds: string,
  region: string,
  now: Date,
): URLSearchParams {
  const from = day(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  const to = day(now);
  const field = kind === "movie" ? "primary_release_date" : "air_date";
  return new URLSearchParams({
    api_key: key,
    with_watch_providers: providerIds,
    watch_region: region,
    with_watch_monetization_types: "flatrate|free|ads",
    [`${field}.gte`]: from,
    [`${field}.lte`]: to,
    sort_by: "popularity.desc",
    include_adult: "false",
  });
}

type Raw = { id: number; poster_path?: string | null; backdrop_path?: string | null; overview?: string; vote_average?: number; popularity?: number; title?: string; release_date?: string; name?: string; first_air_date?: string };

function tmdbMeta(kind: "movie" | "tv", r: Raw): Meta {
  const date = kind === "movie" ? r.release_date : r.first_air_date;
  return {
    id: `tmdb:${kind}:${r.id}`,
    type: kind === "movie" ? "movie" : "series",
    name: (kind === "movie" ? r.title : r.name) ?? "",
    poster: `${IMG}/w342${r.poster_path}`,
    background: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : undefined,
    description: r.overview,
    releaseInfo: date?.slice(0, 4),
    releaseDate: date,
    imdbRating: r.vote_average && r.vote_average > 0 ? Number(r.vote_average).toFixed(1) : undefined,
  };
}

async function discover(kind: "movie" | "tv", params: URLSearchParams): Promise<Raw[]> {
  try {
    const res = await safeFetch(`${TMDB}/discover/${kind}?${params.toString()}`);
    if (!res.ok) return [];
    return ((await res.json()).results ?? []) as Raw[];
  } catch (e) {
    console.warn("[service] new releases failed", { kind, error: e });
    return [];
  }
}

/** The service's new films and series in the region, most popular first. */
export async function fetchNewReleases(key: string, providerIds: string, region: string, now = new Date()): Promise<Meta[]> {
  if (!key) return [];
  const [movies, series] = await Promise.all(
    (["movie", "tv"] as const).map(async (kind) =>
      (await discover(kind, newReleasesParams(kind, key, providerIds, region, now)))
        .filter((r) => r.poster_path)
        .map((r) => ({ meta: tmdbMeta(kind, r), popularity: r.popularity ?? 0 })),
    ),
  );
  return [...movies, ...series]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX)
    .map((r) => r.meta);
}
