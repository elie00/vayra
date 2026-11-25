import { safeFetch as fetch } from "@/lib/safe-fetch";
import { registerEvictable } from "@/lib/maintenance";
import type { RequestDiagnostics } from "@/lib/request-outcome";

const CINEMETA = "https://v3-cinemeta.strem.io";
const CATALOG_TTL_MS = 5 * 60 * 1000;
const CATALOG_MAX_ENTRIES = 200;
const META_TTL_MS = 10 * 60 * 1000;
const META_MAX_ENTRIES = 400;

type TimedEntry<T> = { value: T; expiresAt: number };
const catalogCache = new Map<string, TimedEntry<Meta[]>>();
const catalogInflight = new Map<string, Promise<{ metas: Meta[]; failed: boolean }>>();
const metaCache = new Map<string, TimedEntry<Meta>>();
const metaInflight = new Map<string, Promise<Meta | null>>();

function lruGet<T>(cache: Map<string, TimedEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function lruSet<T>(cache: Map<string, TimedEntry<T>>, key: string, value: T, ttlMs: number, max: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearCinemetaCache(): void {
  catalogCache.clear();
  metaCache.clear();
}

registerEvictable("cinemeta", (aggressive) => {
  if (aggressive) {
    clearCinemetaCache();
    return;
  }
  const now = Date.now();
  for (const [k, v] of catalogCache) if (now >= v.expiresAt) catalogCache.delete(k);
  for (const [k, v] of metaCache) if (now >= v.expiresAt) metaCache.delete(k);
});

export type MetaType = "movie" | "series" | "channel" | "tv" | "anime" | "other";

export function narrowMediaType(t: MetaType | string | undefined): "movie" | "series" {
  return t === "series" ? "series" : "movie";
}

export type Meta = {
  id: string;
  type: MetaType;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  originalLanguage?: string;
  country?: string;
  malId?: number;
  animeFormat?: string;
  releaseInfo?: string;
  releaseDate?: string;
  inTheaters?: boolean;
  imdbRating?: string;
  providerBadge?: { name: string; logo: string; tint: string };
  sourceRank?: number;
  tmdbScore?: number;
  runtime?: string;
  genres?: string[];
  trailers?: Array<{ source: string; type?: string }>;
  trailerStreams?: Array<{ ytId?: string; title?: string }>;
  links?: Array<{ name: string; category: string; url: string }>;
  addonOrigin?: { id: string; name: string; logo?: string; base?: string };
  behaviorHints?: { defaultVideoId?: string | null; hasScheduledVideos?: boolean; isLive?: boolean };
  videos?: Array<{
    id?: string;
    season?: number;
    episode?: number;
    number?: number;
    released?: string;
    firstAired?: string;
    name?: string;
    title?: string;
    overview?: string;
    description?: string;
    thumbnail?: string;
    streams?: Array<Record<string, unknown>>;
    /** Stremio native EPG: a video with both times is a scheduled programme. */
    startTime?: string;
    endTime?: string;
  }>;
};

export function isAddonNativeMeta(meta: Meta): boolean {
  if (meta.type === "tv" || meta.type === "channel") return true;
  if (!meta.addonOrigin) return false;
  const id = meta.id || "";
  const resolvable =
    /^tt\d/.test(id) ||
    id.startsWith("tmdb:") ||
    id.startsWith("kitsu:") ||
    id.startsWith("mal:");
  return !resolvable;
}

async function catalog(path: string, diagnostics?: RequestDiagnostics): Promise<Meta[]> {
  const cached = lruGet(catalogCache, path);
  if (cached) return cached;

  let pending = catalogInflight.get(path);
  if (!pending) {
    pending = (async () => {
      let res: Response;
      try {
        res = await fetch(`${CINEMETA}/catalog/${path}.json`);
      } catch {
        // Unreachable (offline, filtered network) reads like any other failed catalog.
        return { metas: [] as Meta[], failed: true };
      }
      if (!res.ok) return { metas: [] as Meta[], failed: true };
      try {
        const json = await res.json();
        const metas = (json.metas ?? []) as Meta[];
        if (metas.length > 0) lruSet(catalogCache, path, metas, CATALOG_TTL_MS, CATALOG_MAX_ENTRIES);
        return { metas, failed: false };
      } catch {
        return { metas: [] as Meta[], failed: true };
      }
    })().finally(() => {
      if (catalogInflight.get(path) === pending) catalogInflight.delete(path);
    });
    catalogInflight.set(path, pending);
  }
  const result = await pending;
  if (result.failed && diagnostics) diagnostics.failed = true;
  return result.metas;
}

function cinemetaTopPath(type: "movie" | "series", genre?: string, skip = 0): string {
  const parts = [`${type}/top`];
  if (genre) parts.push(`genre=${encodeURIComponent(genre)}`);
  if (skip > 0) parts.push(`skip=${skip}`);
  return parts.join("/");
}

export const topMovies = (genre?: string, skip = 0, diagnostics?: RequestDiagnostics) =>
  catalog(cinemetaTopPath("movie", genre, skip), diagnostics);

export const topSeries = (genre?: string, skip = 0, diagnostics?: RequestDiagnostics) =>
  catalog(cinemetaTopPath("series", genre, skip), diagnostics);

export async function meta(type: "movie" | "series", id: string): Promise<Meta | null> {
  const key = `${type}/${id}`;
  const cached = lruGet(metaCache, key);
  if (cached) return cached;

  let pending = metaInflight.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`${CINEMETA}/meta/${type}/${id}.json`);
      if (!res.ok) return null;
      const json = await res.json();
      const found = (json.meta ?? null) as Meta | null;
      if (found) lruSet(metaCache, key, found, META_TTL_MS, META_MAX_ENTRIES);
      return found;
    })().finally(() => {
      if (metaInflight.get(key) === pending) metaInflight.delete(key);
    });
    metaInflight.set(key, pending);
  }
  return pending;
}
