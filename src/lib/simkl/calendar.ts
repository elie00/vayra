import { safeFetch as fetch } from "@/lib/safe-fetch";
import type { CalendarItem } from "@/lib/calendar";
import { SIMKL_CLIENT_ID } from "./config";

export type SimklCdnItem = {
  title: string;
  poster?: string;
  date: string; // ISO date string e.g., "2026-06-30T00:00:00-05:00"
  release_date?: string;
  ratings?: {
    simkl?: {
      rating?: number | null;
      votes?: number | null;
    };
  };
  ids?: {
    simkl_id?: number;
    slug?: string;
    tmdb?: string | number;
    imdb?: string;
  };
  episode?: {
    season?: number;
    episode?: number;
  };
};

function mapCdnItem(item: SimklCdnItem, type: "tv" | "movie", isAnime: boolean): CalendarItem {
  const tmdbId = item.ids?.tmdb ? String(item.ids.tmdb) : null;
  const id =
    item.ids?.imdb ??
    (tmdbId
      ? type === "movie"
        ? `tmdb:movie:${tmdbId}`
        : `tmdb:tv:${tmdbId}`
      : `simkl:${item.ids?.simkl_id}`);

  let name = item.title;
  if (type === "tv" && item.episode?.season !== undefined && item.episode?.episode !== undefined) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const epLabel = `S${pad(item.episode.season)}E${pad(item.episode.episode)}`;
    name = `${item.title} ${epLabel}`;
  }

  const poster = item.poster ? `https://simkl.in/posters/${item.poster}_m.jpg` : null;

  return {
    id,
    imdbId: item.ids?.imdb ?? null,
    type,
    name,
    poster,
    background: null,
    releaseDate: (item.date ?? "").slice(0, 10),
    isAnime,
    overview: "",
    voteAverage: item.ratings?.simkl?.rating ?? 0,
  };
}

export async function fetchSimklCdnRolling(catalog: "tv" | "anime" | "movie"): Promise<CalendarItem[]> {
  const filename = catalog === "movie" ? "movie_release.json" : `${catalog}.json`;
  const url = `https://data.simkl.in/calendar/${filename}?client_id=${SIMKL_CLIENT_ID}&app-name=harbor&app-version=0.9.19`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "harbor/0.9.19" } });
    if (!res.ok) return [];
    const data = (await res.json()) as SimklCdnItem[];
    const type = catalog === "movie" ? "movie" : "tv";
    const isAnime = catalog === "anime";
    return data.map((item) => mapCdnItem(item, type, isAnime));
  } catch {
    return [];
  }
}

export async function fetchSimklCdnArchive(
  year: number,
  month: number, // 0-indexed (0 = Jan)
  catalog: "tv" | "anime" | "movie",
): Promise<CalendarItem[]> {
  const filename = catalog === "movie" ? "movie_release.json" : `${catalog}.json`;
  const simklMonth = month + 1; // 1-indexed for Simkl CDN
  const url = `https://data.simkl.in/calendar/${year}/${simklMonth}/${filename}?client_id=${SIMKL_CLIENT_ID}&app-name=harbor&app-version=0.9.19`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "harbor/0.9.19" } });
    if (!res.ok) return [];
    const data = (await res.json()) as SimklCdnItem[];
    const type = catalog === "movie" ? "movie" : "tv";
    const isAnime = catalog === "anime";
    return data.map((item) => mapCdnItem(item, type, isAnime));
  } catch {
    return [];
  }
}

const calendarCache = new Map<string, Promise<CalendarItem[]>>();

export function fetchSimklCdnCalendar(year: number, month: number): Promise<CalendarItem[]> {
  const cacheKey = `${year}-${month}`;
  let p = calendarCache.get(cacheKey);
  if (!p) {
    p = Promise.all([
      fetchSimklCdnArchive(year, month, "tv"),
      fetchSimklCdnArchive(year, month, "anime"),
      fetchSimklCdnArchive(year, month, "movie"),
    ]).then(([tv, anime, movies]) => {
      const combined = [...tv, ...anime, ...movies];
      combined.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
      return combined;
    });
    calendarCache.set(cacheKey, p);
  }
  return p;
}

export function clearCalendarCache() {
  calendarCache.clear();
}
