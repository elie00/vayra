import { hydrateTraktItems } from "@/lib/trakt/hydrate";
import type { TraktItem } from "@/lib/trakt/types";
import type { Meta } from "@/lib/cinemeta";
import { externalToKitsu } from "@/lib/providers/anime-mapping";
import { kitsuAnime } from "@/lib/providers/kitsu";
import type { HomeRow } from "@/views/home/home-types";
import { fetchWatchingItems, fetchWatchlist } from "./watchlist";
import type { SimklItem, SimklIds } from "./types";
import { safeFetch } from "@/lib/safe-fetch";
import { SIMKL_CLIENT_ID } from "./config";
import { getLocalCache } from "./activities";
import type { Settings } from "@/lib/settings";

const PER_RAIL = 24;

interface SimklCdnItem {
  title: string;
  poster?: string;
  date: string;
  release_date?: string;
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
}

let cachedTrending: SimklItem[] | null = null;
let cachedTrendingTime = 0;
const TRENDING_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchSimklTrending(): Promise<SimklItem[]> {
  const now = Date.now();
  if (cachedTrending && now - cachedTrendingTime < TRENDING_CACHE_DURATION) {
    return cachedTrending;
  }

  const url = `https://data.simkl.in/discover/trending/today_100.json?client_id=${SIMKL_CLIENT_ID}&app-name=harbor&app-version=0.9.19`;
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": "harbor/0.9.19" } });
    if (!res.ok) return cachedTrending || [];
    const data = (await res.json()) as {
      tv?: any[];
      movies?: any[];
      anime?: any[];
    };

    const tv = data.tv || [];
    const movies = data.movies || [];
    const anime = data.anime || [];

    const items: SimklItem[] = [];
    const maxLen = Math.max(tv.length, movies.length, anime.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < tv.length) {
        const x = tv[i];
        items.push({
          type: "show",
          title: x.title,
          year: x.release_date ? parseInt(x.release_date.split("/").pop() || "", 10) || null : null,
          ids: {
            simkl: x.ids?.simkl_id,
            imdb: x.ids?.imdb || undefined,
            tmdb: x.ids?.tmdb ? Number(x.ids.tmdb) : undefined,
            tvdb: x.ids?.tvdb ? Number(x.ids.tvdb) : undefined,
          },
        });
      }
      if (i < movies.length) {
        const x = movies[i];
        items.push({
          type: "movie",
          title: x.title,
          year: x.release_date ? parseInt(x.release_date.split("/").pop() || "", 10) || null : null,
          ids: {
            simkl: x.ids?.simkl_id,
            imdb: x.ids?.imdb || undefined,
            tmdb: x.ids?.tmdb ? Number(x.ids.tmdb) : undefined,
            tvdb: x.ids?.tvdb ? Number(x.ids.tvdb) : undefined,
          },
        });
      }
      if (i < anime.length) {
        const x = anime[i];
        items.push({
          type: x.anime_type === "movie" ? "movie" : "show",
          title: x.title,
          year: x.release_date ? parseInt(x.release_date.split("/").pop() || "", 10) || null : null,
          ids: {
            simkl: x.ids?.simkl_id,
            imdb: x.ids?.imdb || undefined,
            tmdb: x.ids?.tmdb ? Number(x.ids.tmdb) : undefined,
            mal: x.ids?.mal ? Number(x.ids.mal) : undefined,
            kitsu: x.ids?.kitsu ? Number(x.ids.kitsu) : undefined,
            anidb: x.ids?.anidb ? Number(x.ids.anidb) : undefined,
            tvdb: x.ids?.tvdb ? Number(x.ids.tvdb) : undefined,
          },
        });
      }
    }

    cachedTrending = items;
    cachedTrendingTime = now;
    return items;
  } catch (err) {
    console.error("Failed to fetch SIMKL trending CDN", err);
    return cachedTrending || [];
  }
}

let cachedCalendar: SimklCdnItem[] | null = null;
let cachedCalendarTime = 0;
const CALENDAR_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function fetchCdnCalendarCombined(): Promise<SimklCdnItem[]> {
  const now = Date.now();
  if (cachedCalendar && now - cachedCalendarTime < CALENDAR_CACHE_DURATION) {
    return cachedCalendar;
  }

  const fetchCatalog = async (catalog: "tv" | "anime"): Promise<SimklCdnItem[]> => {
    const url = `https://data.simkl.in/calendar/${catalog}.json?client_id=${SIMKL_CLIENT_ID}&app-name=harbor&app-version=0.9.19`;
    try {
      const res = await safeFetch(url, { headers: { "User-Agent": "harbor/0.9.19" } });
      if (!res.ok) return [];
      return (await res.json()) as SimklCdnItem[];
    } catch {
      return [];
    }
  };

  const [tv, anime] = await Promise.all([fetchCatalog("tv"), fetchCatalog("anime")]);
  const combined = [...tv, ...anime];
  cachedCalendar = combined;
  cachedCalendarTime = now;
  return combined;
}

function toHydratable(items: SimklItem[]): TraktItem[] {
  return items.map((it) => ({
    type: it.type,
    title: it.title,
    year: it.year,
    ids: {
      imdb: it.ids.imdb,
      tmdb: typeof it.ids.tmdb === "number" ? it.ids.tmdb : undefined,
    },
  }));
}

function isAnimeItem(it: SimklItem): boolean {
  return it.ids.mal != null || it.ids.anidb != null;
}

async function hydrateSimklAnime(it: SimklItem): Promise<Meta | null> {
  const source = it.ids.mal != null ? "myanimelist" : "anidb";
  const ext = it.ids.mal ?? it.ids.anidb;
  if (ext == null) return null;
  const kitsuId = await externalToKitsu(source, ext).catch(() => null);
  if (kitsuId == null) return null;
  const d = await kitsuAnime(kitsuId).catch(() => null);
  if (!d || !d.poster) return null;
  return {
    id: `kitsu:${d.id}`,
    type: d.subtype === "movie" ? "movie" : "series",
    name: d.title,
    poster: d.poster,
    background: d.backdrop,
    description: d.synopsis,
    releaseInfo: d.year,
    imdbRating: d.rating,
  };
}

export async function hydrateSimklItems(items: SimklItem[], tmdbKey: string): Promise<Meta[]> {
  const metas = await Promise.all(
    items.map((it) =>
      isAnimeItem(it)
        ? hydrateSimklAnime(it).catch(() => null)
        : hydrateTraktItems(toHydratable([it]), tmdbKey)
            .then((r) => r[0] ?? null)
            .catch(() => null),
    ),
  );
  return metas.filter((m): m is Meta => !!m && !!m.poster);
}

export async function buildSimklHomeRows(settings: Settings): Promise<HomeRow[]> {
  // If settings.simklHomeRailsEnabled is false, do not return/display any SIMKL rows
  // (but you can still keep background cache updates active).
  if (!settings.simklHomeRailsEnabled) {
    void fetchWatchlist().catch(() => []);
    void fetchWatchingItems().catch(() => []);
    return [];
  }

  const tmdbKey = settings.tmdbKey;

  // Compute Up Next Shows
  const cache = getLocalCache();
  const upcomingShows: SimklItem[] = [];

  if (cache) {
    try {
      const calendarItems = await fetchCdnCalendarCombined();
      // Sort by date ascending so we grab the earliest upcoming episode of a show
      calendarItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const limitDate = new Date();
      limitDate.setDate(today.getDate() + 30); // 30 days upcoming lookahead

      const matchedIds = new Set<number>();

      for (const cdnItem of calendarItems) {
        const epDate = new Date(cdnItem.date);
        if (isNaN(epDate.getTime()) || epDate < today || epDate > limitDate) {
          continue;
        }

        let matchedSimklId: number | null = null;
        if (cdnItem.ids?.simkl_id && cache.items[String(cdnItem.ids.simkl_id)]) {
          matchedSimklId = cdnItem.ids.simkl_id;
        } else if (cdnItem.ids?.imdb && cache.imdbToSimkl[cdnItem.ids.imdb]) {
          matchedSimklId = cache.imdbToSimkl[cdnItem.ids.imdb];
        } else if (cdnItem.ids?.tmdb) {
          const tmdbKey = `tv:${cdnItem.ids.tmdb}`;
          if (cache.tmdbToSimkl[tmdbKey]) {
            matchedSimklId = cache.tmdbToSimkl[tmdbKey];
          }
        }

        if (matchedSimklId && !matchedIds.has(matchedSimklId)) {
          const cachedItem = cache.items[String(matchedSimklId)];
          if (
            cachedItem &&
            (cachedItem.type === "show" || cachedItem.type === "anime") &&
            (cachedItem.status === "watching" || cachedItem.status === "plantowatch")
          ) {
            matchedIds.add(matchedSimklId);

            const ids: SimklIds = {
              simkl: cachedItem.simklId,
            };
            for (const [imdbId, sId] of Object.entries(cache.imdbToSimkl)) {
              if (sId === cachedItem.simklId) ids.imdb = imdbId;
            }
            for (const [tmdbKey, sId] of Object.entries(cache.tmdbToSimkl)) {
              if (sId === cachedItem.simklId) {
                const parts = tmdbKey.split(":");
                if (parts.length === 2) {
                  ids.tmdb = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : parts[1];
                }
              }
            }
            for (const [malId, sId] of Object.entries(cache.malToSimkl)) {
              if (sId === cachedItem.simklId) ids.mal = Number(malId);
            }
            for (const kitsuId of Object.keys(cache.kitsuToSimkl)) {
              if (cache.kitsuToSimkl[kitsuId] === cachedItem.simklId) {
                ids.kitsu = Number(kitsuId);
              }
            }

            if (!ids.imdb && cdnItem.ids?.imdb) ids.imdb = cdnItem.ids.imdb;
            if (!ids.tmdb && cdnItem.ids?.tmdb) ids.tmdb = Number(cdnItem.ids.tmdb);

            upcomingShows.push({
              type: "show",
              title: cachedItem.title,
              year: cachedItem.year,
              ids,
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to compute Up Next shows on SIMKL", e);
    }
  }

  // Fetch Watchlist, Watching, Trending
  const [plan, watching, trendingItems] = await Promise.all([
    fetchWatchlist().catch(() => []),
    fetchWatchingItems().catch(() => []),
    fetchSimklTrending().catch(() => []),
  ]);

  // Hydrate metas
  const [planMetas, watchMetas, upcomingMetas, trendingMetas] = await Promise.all([
    hydrateSimklItems(plan.slice(0, PER_RAIL), tmdbKey),
    hydrateSimklItems(watching.slice(0, PER_RAIL), tmdbKey),
    hydrateSimklItems(upcomingShows.slice(0, PER_RAIL), tmdbKey),
    hydrateSimklItems(trendingItems.slice(0, PER_RAIL), tmdbKey),
  ]);

  const rows: HomeRow[] = [];

  const pager = (items: SimklItem[]) => async (page: number) => {
    const slice = items.slice((page - 1) * PER_RAIL, page * PER_RAIL);
    if (slice.length === 0) return [];
    return hydrateSimklItems(slice, tmdbKey);
  };

  if (watchMetas.length >= 4 && (settings.simklGranularFilters.shows.watching || settings.simklGranularFilters.anime.watching)) {
    rows.push({
      key: "simkl-watching",
      type: watching[0]?.type === "show" ? "series" : "movie",
      name: "Watching on Simkl",
      metas: watchMetas,
      page: 1,
      hasMore: watching.length > PER_RAIL,
      noDedup: true,
      fetcher: pager(watching),
    });
  }

  if (upcomingMetas.length >= 4 && (settings.simklGranularFilters.shows.watching || settings.simklGranularFilters.shows.plantowatch || settings.simklGranularFilters.anime.watching || settings.simklGranularFilters.anime.plantowatch)) {
    rows.push({
      key: "simkl-upcoming",
      type: "series",
      name: "Up Next on Simkl",
      metas: upcomingMetas,
      page: 1,
      hasMore: upcomingShows.length > PER_RAIL,
      noDedup: true,
      fetcher: pager(upcomingShows),
    });
  }

  if (planMetas.length >= 4 && (settings.simklGranularFilters.movies.plantowatch || settings.simklGranularFilters.shows.plantowatch || settings.simklGranularFilters.anime.plantowatch)) {
    rows.push({
      key: "simkl-plantowatch",
      type: plan[0]?.type === "show" ? "series" : "movie",
      name: "Your Simkl Plan to Watch",
      metas: planMetas,
      page: 1,
      hasMore: plan.length > PER_RAIL,
      noDedup: true,
      fetcher: pager(plan),
    });
  }

  if (trendingMetas.length >= 4) {
    rows.push({
      key: "simkl-trending",
      type: trendingItems[0]?.type === "show" ? "series" : "movie",
      name: "Simkl Trending Today",
      metas: trendingMetas,
      page: 1,
      hasMore: trendingItems.length > PER_RAIL,
      noDedup: true,
      fetcher: pager(trendingItems),
    });
  }

  return rows;
}

export function clearHomeRailsCache() {
  cachedTrending = null;
  cachedTrendingTime = 0;
  cachedCalendar = null;
  cachedCalendarTime = 0;
}
