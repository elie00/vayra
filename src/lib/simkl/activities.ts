import { simklRequest } from "./client";
import { getSession } from "./session";
import type { WatchlistStatus } from "./list-status";
import { invalidateListStatusCache } from "./list-status";
import type { SimklTarget } from "./types";

export type SimklCacheItem = {
  simklId: number;
  type: "movie" | "show" | "anime";
  title: string;
  year: number | null;
  status: WatchlistStatus;
  userRating: number | null;          // 1-10 value or null
  watchedAt: string | null;           // Date when added or watched
  watchedEpisodes?: string[];         // For shows & anime: array of "season:episode" watched
  poster?: string | null;             // Caches paths like "19/198249"
};

export type SimklCache = {
  lastSync: string | null;            // activities.all ISO-8601 timestamp
  activities: {
    movies: string | null;            // activities.movies.all timestamp
    shows: string | null;             // activities.tv_shows.all timestamp
    anime: string | null;             // activities.anime.all timestamp
    ratings: string | null;           // activities.tv_shows.rated_at / movies.rated_at etc
  } | null;
  items: Record<string, SimklCacheItem>; // Keyed by SIMKL ID (e.g. "12345")
  imdbToSimkl: Record<string, number>;
  tmdbToSimkl: Record<string, number>; // Format: "movie:123" or "tv:123"
  malToSimkl: Record<string, number>;
  kitsuToSimkl: Record<string, number>;
};

const CACHE_KEY = "harbor.simkl.cache.v2";

export function getLocalCache(): SimklCache | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SimklCache;
  } catch {
    return null;
  }
}

export function saveLocalCache(cache: SimklCache) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Failed to save SIMKL cache", e);
  }
}

export function clearLocalCache() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.removeItem(CACHE_KEY);
}

interface RawIds {
  simkl?: number;
  imdb?: string;
  tmdb?: number | string;
  tvdb?: number;
  mal?: number;
  anidb?: number;
  kitsu?: number | string;
}

interface RawEpisode {
  number?: number;
  watched_at?: string | null;
}

interface RawSeason {
  number?: number;
  episodes?: RawEpisode[];
}

interface RawNode {
  title?: string;
  year?: number | null;
  ids?: RawIds;
  poster?: string | null;
}

interface RawEntry {
  status?: string;
  added_to_watchlist_at?: string;
  user_rating?: number | null;
  rating?: number | null;
  movie?: RawNode;
  show?: RawNode;
  anime?: RawNode;
  seasons?: RawSeason[];
}

interface RawAllItems {
  movies?: RawEntry[];
  shows?: RawEntry[];
  anime?: RawEntry[];
}

interface RawRatingEntry {
  rating?: number;
  movie?: { ids?: RawIds };
  show?: { ids?: RawIds };
  anime?: { ids?: RawIds };
}

interface RawRatingsResponse {
  movies?: RawRatingEntry[];
  shows?: RawRatingEntry[];
  anime?: RawRatingEntry[];
}

function isStatus(s: string | undefined): s is WatchlistStatus {
  return (
    s === "watching" || s === "plantowatch" || s === "hold" || s === "completed" || s === "dropped"
  );
}

function getLatestTimestamp(...dates: Array<string | null | undefined>): string | null {
  const validDates = dates.filter(Boolean) as string[];
  if (validDates.length === 0) return null;
  return validDates.reduce((latest, current) => (current > latest ? current : latest));
}

function indexItem(cache: SimklCache, item: SimklCacheItem, ids: RawIds | undefined) {
  if (!ids) return;
  const simklId = item.simklId;
  
  if (ids.imdb) {
    cache.imdbToSimkl[ids.imdb] = simklId;
  }
  if (ids.tmdb != null) {
    const tmdbKey = item.type === "movie" ? `movie:${ids.tmdb}` : `tv:${ids.tmdb}`;
    cache.tmdbToSimkl[tmdbKey] = simklId;
  }
  if (ids.mal != null) {
    cache.malToSimkl[String(ids.mal)] = simklId;
  }
  if (ids.kitsu != null) {
    cache.kitsuToSimkl[String(ids.kitsu)] = simklId;
  }
}

function pruneItem(cache: SimklCache, simklId: number) {
  const simklIdStr = String(simklId);
  delete cache.items[simklIdStr];

  for (const key of Object.keys(cache.imdbToSimkl)) {
    if (cache.imdbToSimkl[key] === simklId) delete cache.imdbToSimkl[key];
  }
  for (const key of Object.keys(cache.tmdbToSimkl)) {
    if (cache.tmdbToSimkl[key] === simklId) delete cache.tmdbToSimkl[key];
  }
  for (const key of Object.keys(cache.malToSimkl)) {
    if (cache.malToSimkl[key] === simklId) delete cache.malToSimkl[key];
  }
  for (const key of Object.keys(cache.kitsuToSimkl)) {
    if (cache.kitsuToSimkl[key] === simklId) delete cache.kitsuToSimkl[key];
  }
}

function parseAndMergeEntry(cache: SimklCache, entry: RawEntry, type: "movie" | "show" | "anime") {
  const node = type === "movie" ? entry.movie : type === "anime" ? (entry.anime || entry.show || entry.movie) : entry.show;
  if (!node || !node.ids || !node.ids.simkl) return;

  const simklId = node.ids.simkl;
  const simklIdStr = String(simklId);

  let status: WatchlistStatus = "plantowatch";
  if (entry.status && isStatus(entry.status)) {
    status = entry.status;
  }

  let userRating: number | null = null;
  if (entry.user_rating != null) {
    userRating = entry.user_rating;
  } else if (entry.rating != null) {
    userRating = entry.rating;
  }

  let watchedEpisodes: string[] | undefined;
  if (type !== "movie" && entry.seasons) {
    const eps: string[] = [];
    for (const s of entry.seasons) {
      for (const ep of s.episodes ?? []) {
        if (ep.watched_at && s.number != null && ep.number != null) {
          eps.push(`${s.number}:${ep.number}`);
        }
      }
    }
    if (eps.length > 0) {
      watchedEpisodes = eps;
    }
  }

  const existing = cache.items[simklIdStr];
  const item: SimklCacheItem = {
    simklId,
    type,
    title: node.title ?? existing?.title ?? "",
    year: node.year ?? existing?.year ?? null,
    status,
    userRating: userRating ?? existing?.userRating ?? null,
    watchedAt: entry.added_to_watchlist_at ?? existing?.watchedAt ?? null,
    watchedEpisodes: watchedEpisodes ?? existing?.watchedEpisodes,
    poster: (entry.anime?.poster || entry.show?.poster || entry.movie?.poster) ?? existing?.poster ?? null,
  };

  cache.items[simklIdStr] = item;
  indexItem(cache, item, node.ids);
}

function mergeRatings(cache: SimklCache, ratings: RawRatingsResponse) {
  const mergeList = (list: RawRatingEntry[] | undefined, type: "movie" | "show" | "anime") => {
    for (const entry of list ?? []) {
      const node = type === "movie" ? entry.movie : type === "anime" ? (entry.anime || entry.show || entry.movie) : entry.show;
      if (!node?.ids?.simkl) continue;
      const simklId = node.ids.simkl;
      const simklIdStr = String(simklId);
      
      const existing = cache.items[simklIdStr];
      if (existing) {
        existing.userRating = entry.rating ?? null;
      } else {
        const item: SimklCacheItem = {
          simklId,
          type,
          title: "",
          year: null,
          status: "completed",
          userRating: entry.rating ?? null,
          watchedAt: null,
        };
        cache.items[simklIdStr] = item;
        indexItem(cache, item, node.ids);
      }
    }
  };
  mergeList(ratings.movies, "movie");
  mergeList(ratings.shows, "show");
  mergeList(ratings.anime, "anime");
}

async function bootstrapCache(): Promise<SimklCache> {
  const cache: SimklCache = {
    lastSync: null,
    activities: null,
    items: {},
    imdbToSimkl: {},
    tmdbToSimkl: {},
    malToSimkl: {},
    kitsuToSimkl: {},
  };

  // 1. Pull Shows sequentially
  const showsData = await simklRequest<RawAllItems>(
    "/sync/all-items/shows/all?extended=full&episode_watched_at=yes"
  ).catch(() => ({}) as RawAllItems);
  for (const entry of showsData.shows ?? []) {
    parseAndMergeEntry(cache, entry, "show");
  }

  // 2. Pull Movies sequentially
  const moviesData = await simklRequest<RawAllItems>(
    "/sync/all-items/movies/all?extended=full&episode_watched_at=yes"
  ).catch(() => ({}) as RawAllItems);
  for (const entry of moviesData.movies ?? []) {
    parseAndMergeEntry(cache, entry, "movie");
  }

  // 3. Pull Anime sequentially
  const animeData = await simklRequest<RawAllItems>(
    "/sync/all-items/anime/all?extended=full&episode_watched_at=yes"
  ).catch(() => ({}) as RawAllItems);
  for (const entry of animeData.anime ?? []) {
    parseAndMergeEntry(cache, entry, "anime");
  }

  // 4. Pull User Ratings
  const ratingsData = await simklRequest<RawRatingsResponse>(
    "/sync/ratings"
  ).catch(() => ({}) as RawRatingsResponse);
  mergeRatings(cache, ratingsData);

  // 5. Fetch /sync/activities
  const activities = await simklRequest<any>("/sync/activities").catch(() => null);
  
  if (activities) {
    const tvShowsRatedAt = activities.shows?.rated_at || activities.tv_shows?.rated_at;
    const ratingsTimestamp = getLatestTimestamp(
      activities.movies?.rated_at,
      tvShowsRatedAt,
      activities.anime?.rated_at
    );
    
    cache.lastSync = activities.all || new Date().toISOString();
    cache.activities = {
      movies: activities.movies?.all ?? null,
      shows: activities.shows?.all ?? activities.tv_shows?.all ?? null,
      anime: activities.anime?.all ?? null,
      ratings: ratingsTimestamp,
    };
  }

  saveLocalCache(cache);
  return cache;
}

async function performDeltaSync(cache: SimklCache, activities: any): Promise<SimklCache> {
  const currentLastSync = cache.lastSync;
  
  if (activities.all && activities.all === currentLastSync) {
    return cache;
  }

  const dateFrom = currentLastSync ? encodeURIComponent(currentLastSync) : "";
  const deltaData = await simklRequest<RawAllItems>(
    `/sync/all-items?date_from=${dateFrom}`
  ).catch(() => ({}) as RawAllItems);

  for (const entry of deltaData.shows ?? []) {
    parseAndMergeEntry(cache, entry, "show");
  }
  for (const entry of deltaData.movies ?? []) {
    parseAndMergeEntry(cache, entry, "movie");
  }
  for (const entry of deltaData.anime ?? []) {
    parseAndMergeEntry(cache, entry, "anime");
  }

  const moviesRemoved = activities.movies?.removed_from_list;
  const tvShowsRemoved = activities.shows?.removed_from_list || activities.tv_shows?.removed_from_list;
  const animeRemoved = activities.anime?.removed_from_list;

  const isRemovedSinceLastSync = (removedDate: string | null | undefined) => {
    if (!removedDate || !currentLastSync) return false;
    return new Date(removedDate) > new Date(currentLastSync);
  };

  const hasRemovals = isRemovedSinceLastSync(moviesRemoved) ||
                      isRemovedSinceLastSync(tvShowsRemoved) ||
                      isRemovedSinceLastSync(animeRemoved);

  if (hasRemovals) {
    const idsOnlyData = await simklRequest<RawAllItems>(
      "/sync/all-items?extended=simkl_ids_only"
    ).catch(() => ({}) as RawAllItems);

    const validIds = new Set<number>();
    const addIds = (entries: RawEntry[] | undefined, type: "movie" | "show" | "anime") => {
      for (const e of entries ?? []) {
        const node = type === "movie" ? e.movie : type === "anime" ? (e.anime || e.show || e.movie) : e.show;
        if (node?.ids?.simkl) {
          validIds.add(node.ids.simkl);
        }
      }
    };
    addIds(idsOnlyData.movies, "movie");
    addIds(idsOnlyData.shows, "show");
    addIds(idsOnlyData.anime, "anime");

    for (const simklIdStr of Object.keys(cache.items)) {
      const item = cache.items[simklIdStr];
      if (!validIds.has(item.simklId)) {
        pruneItem(cache, item.simklId);
      }
    }
  }

  const tvShowsRatedAt = activities.shows?.rated_at || activities.tv_shows?.rated_at;
  const ratingsTimestamp = getLatestTimestamp(
    activities.movies?.rated_at,
    tvShowsRatedAt,
    activities.anime?.rated_at
  );

  cache.lastSync = activities.all || new Date().toISOString();
  cache.activities = {
    movies: activities.movies?.all ?? null,
    shows: activities.shows?.all ?? activities.tv_shows?.all ?? null,
    anime: activities.anime?.all ?? null,
    ratings: ratingsTimestamp,
  };

  saveLocalCache(cache);
  return cache;
}

let activeSyncPromise: Promise<SimklCache> | null = null;

export function syncWatchlistCache(): Promise<SimklCache> {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    try {
      const session = getSession();
      if (!session) {
        throw new Error("User not authenticated");
      }

      let cache = getLocalCache();
      if (!cache || !cache.lastSync) {
        cache = await bootstrapCache();
        invalidateListStatusCache();
      } else {
        const activities = await simklRequest<any>("/sync/activities").catch(() => null);
        if (activities) {
          const previousLastSync = cache.lastSync;
          cache = await performDeltaSync(cache, activities);
          if (cache.lastSync !== previousLastSync) {
            invalidateListStatusCache();
          }
        }
      }
      return cache;
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export async function getCachedSimklData(): Promise<{
  statuses: Map<string, WatchlistStatus>;
  watched: Map<string, Set<string>>;
}> {
  let cache = getLocalCache();
  if (!cache || !cache.lastSync) {
    cache = await syncWatchlistCache().catch(() => null);
  }
  
  const statuses = new Map<string, WatchlistStatus>();
  const watched = new Map<string, Set<string>>();

  if (!cache) {
    return { statuses, watched };
  }

  const registerKeys = (item: SimklCacheItem, simklId: number) => {
    const keys: string[] = [];
    
    for (const [imdbId, sId] of Object.entries(cache.imdbToSimkl)) {
      if (sId === simklId) keys.push(imdbId);
    }
    for (const [tmdbKey, sId] of Object.entries(cache.tmdbToSimkl)) {
      if (sId === simklId) {
        const parts = tmdbKey.split(":");
        if (parts.length === 2) {
          keys.push(`tmdb:${parts[0]}:${parts[1]}`);
        }
      }
    }
    for (const [malId, sId] of Object.entries(cache.malToSimkl)) {
      if (sId === simklId) keys.push(`mal:${malId}`);
    }
    for (const [kitsuId, sId] of Object.entries(cache.kitsuToSimkl)) {
      if (sId === simklId) keys.push(`kitsu:${kitsuId}`);
    }
    
    for (const k of keys) {
      statuses.set(k, item.status);
      if (item.watchedEpisodes && item.watchedEpisodes.length > 0) {
        watched.set(k, new Set(item.watchedEpisodes));
      }
    }
  };

  for (const simklIdStr of Object.keys(cache.items)) {
    const item = cache.items[simklIdStr];
    registerKeys(item, item.simklId);
  }

  return { statuses, watched };
}

export function updateCachedStatus(
  simklId: number,
  type: "movie" | "show" | "anime",
  title: string,
  year: number | null,
  status: WatchlistStatus | null,
  externalIds?: RawIds
) {
  const cache = getLocalCache();
  if (!cache) return;

  const simklIdStr = String(simklId);

  if (status === null) {
    pruneItem(cache, simklId);
  } else {
    const existing = cache.items[simklIdStr];
    const item: SimklCacheItem = {
      simklId,
      type,
      title: title || existing?.title || "",
      year: year ?? existing?.year ?? null,
      status,
      userRating: existing?.userRating ?? null,
      watchedAt: existing?.watchedAt ?? new Date().toISOString(),
      watchedEpisodes: existing?.watchedEpisodes,
      poster: existing?.poster ?? null,
    };
    cache.items[simklIdStr] = item;
    if (externalIds) {
      indexItem(cache, item, externalIds);
    }
  }

  saveLocalCache(cache);
}

export function updateCachedStatusByTarget(
  target: SimklTarget,
  status: WatchlistStatus | null
) {
  const isMovie = target.kind === "movie";
  const isAnime = target.kind === "anime" || target.kind === "anime-episode";
  const ids =
    target.kind === "episode"
      ? target.show.ids
      : target.kind === "anime-episode"
        ? target.anime.ids
        : target.ids;
  if (!ids?.simkl) return;

  const type = isMovie ? "movie" : isAnime ? "anime" : "show";

  updateCachedStatus(ids.simkl, type, "", null, status, ids as RawIds);
}

export function updateCachedRatingByTarget(target: SimklTarget, rating: number | null) {
  const cache = getLocalCache();
  if (!cache) return;

  const ids =
    target.kind === "episode"
      ? target.show.ids
      : target.kind === "anime-episode"
        ? target.anime.ids
        : target.ids;
  if (!ids?.simkl) return;

  const simklIdStr = String(ids.simkl);
  const existing = cache.items[simklIdStr];
  if (existing) {
    existing.userRating = rating;
  } else {
    const isMovie = target.kind === "movie";
    const isAnime = target.kind === "anime" || target.kind === "anime-episode";
    const type = isMovie ? "movie" : isAnime ? "anime" : "show";
    const item: SimklCacheItem = {
      simklId: ids.simkl,
      type,
      title: "",
      year: null,
      status: "completed",
      userRating: rating,
      watchedAt: new Date().toISOString(),
    };
    cache.items[simklIdStr] = item;
    indexItem(cache, item, ids as RawIds);
  }

  saveLocalCache(cache);
  invalidateListStatusCache();
}

export function getCachedRatingByTarget(target: SimklTarget): number | null {
  const cache = getLocalCache();
  if (!cache) return null;

  const ids =
    target.kind === "episode"
      ? target.show.ids
      : target.kind === "anime-episode"
        ? target.anime.ids
        : target.ids;
  if (!ids?.simkl) return null;

  return cache.items[String(ids.simkl)]?.userRating ?? null;
}

