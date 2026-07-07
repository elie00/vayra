import { simklRequest } from "./client";
import type { SimklItem, SimklTarget, SimklIds } from "./types";
import { getLocalCache, syncWatchlistCache, updateCachedStatusByTarget } from "./activities";
import type { WatchlistStatus } from "./list-status";

export type RawIds = {
  simkl?: number;
  imdb?: string;
  tmdb?: number | string;
  tvdb?: number;
  mal?: number;
  anidb?: number;
};

export function num(v: number | string | undefined): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function mapIds(ids: RawIds | undefined): SimklIds {
  return {
    simkl: ids?.simkl,
    imdb: ids?.imdb,
    tmdb: num(ids?.tmdb),
    tvdb: ids?.tvdb,
    mal: ids?.mal,
    anidb: ids?.anidb,
  };
}

async function fetchByStatus(status: WatchlistStatus): Promise<SimklItem[]> {
  let cache = getLocalCache();
  if (!cache || !cache.lastSync) {
    cache = await syncWatchlistCache().catch(() => null);
  }
  if (!cache) return [];
  const out: SimklItem[] = [];
  for (const simklIdStr of Object.keys(cache.items)) {
    const item = cache.items[simklIdStr];
    if (item.status === status) {
      const ids: any = { simkl: item.simklId };
      for (const [imdbId, sId] of Object.entries(cache.imdbToSimkl)) {
        if (sId === item.simklId) ids.imdb = imdbId;
      }
      for (const [tmdbKey, sId] of Object.entries(cache.tmdbToSimkl)) {
        if (sId === item.simklId) {
          const parts = tmdbKey.split(":");
          if (parts.length === 2) {
            ids.tmdb = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : parts[1];
          }
        }
      }
      for (const [malId, sId] of Object.entries(cache.malToSimkl)) {
        if (sId === item.simklId) ids.mal = Number(malId);
      }
      for (const [kitsuId, sId] of Object.entries(cache.kitsuToSimkl)) {
        if (sId === item.simklId) ids.kitsu = Number(kitsuId);
      }

      out.push({
        type: item.type === "movie" ? "movie" : "show",
        title: item.title,
        year: item.year,
        ids,
        watchedAt: item.watchedAt ?? undefined,
      });
    }
  }
  return out;
}

export async function fetchWatchlist(): Promise<SimklItem[]> {
  return fetchByStatus("plantowatch");
}

export async function fetchWatchingItems(): Promise<SimklItem[]> {
  return fetchByStatus("watching");
}

export async function addToWatchlist(target: SimklTarget): Promise<boolean> {
  try {
    if (target.kind === "movie") {
      await simklRequest("/sync/add-to-list", {
        method: "POST",
        body: { movies: [{ to: "plantowatch", ids: target.ids }] },
      });
      updateCachedStatusByTarget(target, "plantowatch");
      return true;
    }
    const isAnime = target.kind === "anime" || target.kind === "anime-episode";
    const bucket = isAnime ? "anime" : "shows";
    const ids =
      target.kind === "anime"
        ? target.ids
        : target.kind === "anime-episode"
          ? target.anime.ids
          : target.kind === "show"
            ? target.ids
            : target.show.ids;
    await simklRequest("/sync/add-to-list", {
      method: "POST",
      body: { [bucket]: [{ to: "plantowatch", ids }] },
    });
    updateCachedStatusByTarget(target, "plantowatch");
    return true;
  } catch {
    return false;
  }
}

export async function removeFromWatchlist(target: SimklTarget): Promise<boolean> {
  try {
    if (target.kind === "movie") {
      await simklRequest("/sync/history/remove", {
        method: "POST",
        body: { movies: [{ ids: target.ids }] },
      });
      updateCachedStatusByTarget(target, null);
      return true;
    }
    const isAnime = target.kind === "anime" || target.kind === "anime-episode";
    const bucket = isAnime ? "anime" : "shows";
    const ids =
      target.kind === "anime"
        ? target.ids
        : target.kind === "anime-episode"
          ? target.anime.ids
          : target.kind === "show"
            ? target.ids
            : target.show.ids;
    await simklRequest("/sync/history/remove", {
      method: "POST",
      body: { [bucket]: [{ ids }] },
    });
    updateCachedStatusByTarget(target, null);
    return true;
  } catch {
    return false;
  }
}
