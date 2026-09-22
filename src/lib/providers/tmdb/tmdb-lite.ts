import { effectiveTmdbLanguage, get, IMG } from "./tmdb-client";
import { lruSet } from "../../cache";

export type TmdbLiteMeta = {
  name: string | null;
  poster: string | null;
  background: string | null;
};

const cache = new Map<string, TmdbLiteMeta | null>();
const inflight = new Map<string, Promise<TmdbLiteMeta | null>>();

type RawLite = {
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

const overviewCache = new Map<string, string>();
const overviewInflight = new Map<string, Promise<string | undefined>>();
export async function tmdbMetadataOverview(
  key: string,
  metaId: string,
  type?: string,
  language = effectiveTmdbLanguage() || "en",
): Promise<string | undefined> {
  if (!key) return undefined;
  const m = metaId.match(/^tmdb:(movie|tv):(\d+)$/);
  if (!m && !/^tt\d+$/.test(metaId)) return undefined;
  const cacheKey = `${metaId}|${type ?? ""}|${language}`;
  const hit = overviewCache.get(cacheKey);
  if (hit !== undefined) return hit || undefined;
  const pending = overviewInflight.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
    try {
      let path = m ? `${m[1]}/${m[2]}` : "";
      if (!path) {
        const found = await get<{
          movie_results?: { id: number }[];
          tv_results?: { id: number }[];
        }>(key, `find/${metaId}`, { external_source: "imdb_id", language });
        if (!found) return undefined;
        const movie = found.movie_results?.[0];
        const tv = found.tv_results?.[0];
        // Do not confuse a film with a series sharing a provider result.
        if (type === "movie") path = movie ? `movie/${movie.id}` : "";
        else if (type === "series") path = tv ? `tv/${tv.id}` : "";
        else path = movie ? `movie/${movie.id}` : tv ? `tv/${tv.id}` : "";
        if (!path) return undefined;
      }
      const raw = await get<{ overview?: string }>(key, path, { language });
      // Network/key failures are retryable; never retain them as missing translations.
      if (!raw) return undefined;
      const ov = raw.overview?.trim() || "";
      lruSet(overviewCache, cacheKey, ov, 300);
      return ov || undefined;
    } catch {
      return undefined;
    } finally {
      overviewInflight.delete(cacheKey);
    }
  })();
  overviewInflight.set(cacheKey, request);
  return request;
}

export async function tmdbLiteMeta(key: string, metaId: string): Promise<TmdbLiteMeta | null> {
  if (!key) return null;
  const match = metaId.match(/^tmdb:(movie|tv):(\d+)$/);
  if (!match) return null;
  const hit = cache.get(metaId);
  if (hit !== undefined) return hit;
  const existing = inflight.get(metaId);
  if (existing) return existing;
  const p = (async () => {
    try {
      const raw = await get<RawLite>(key, `${match[1]}/${match[2]}`);
      const out: TmdbLiteMeta | null = raw
        ? {
            name: (raw.title ?? raw.name ?? "").trim() || null,
            poster: raw.poster_path ? `${IMG}/w300${raw.poster_path}` : null,
            background: raw.backdrop_path ? `${IMG}/w780${raw.backdrop_path}` : null,
          }
        : null;
      cache.set(metaId, out);
      return out;
    } catch {
      return null;
    } finally {
      inflight.delete(metaId);
    }
  })();
  inflight.set(metaId, p);
  return p;
}
