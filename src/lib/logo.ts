import { lruSet } from "@/lib/cache";
import { meta as fetchCinemeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { registerEvictable } from "@/lib/maintenance";
import { registerCache } from "@/lib/memory-profiler";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import { tmdbAnimeLogo, tmdbImdbId, tmdbLogo } from "@/lib/providers/tmdb";

const CACHE_MAX = 1200;
const cache = new Map<string, string | undefined>();
const inflight = new Map<string, Promise<string | undefined>>();

registerCache("logo:url", () => cache.size);
registerCache("logo:inflight", () => inflight.size);

registerEvictable("logo", (aggressive) => {
  if (!aggressive) return;
  cache.clear();
});

export async function resolveLogo(tmdbKey: string, meta: Meta): Promise<string | undefined> {
  if (meta.logo) return meta.logo;
  const cacheKey = `${meta.id}::${tmdbKey ? "k" : "n"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const p = doResolve(tmdbKey, meta).then((url) => {
    if (url) lruSet(cache, cacheKey, url, CACHE_MAX);
    inflight.delete(cacheKey);
    return url;
  });
  inflight.set(cacheKey, p);
  return p;
}

export function peekCachedLogo(tmdbKey: string, meta: Meta): string | undefined {
  if (meta.logo) return meta.logo;
  const cacheKey = `${meta.id}::${tmdbKey ? "k" : "n"}`;
  return cache.get(cacheKey);
}

async function doResolve(tmdbKey: string, m: Meta): Promise<string | undefined> {
  if (m.id.startsWith("tt")) {
    const full = await fetchCinemeta(narrowMediaType(m.type),m.id);
    return full?.logo;
  }
  if (m.id.startsWith("tmdb:")) {
    if (tmdbKey) {
      const fromTmdb = await tmdbLogo(tmdbKey, m.id);
      if (fromTmdb) return fromTmdb;
      const tt = await tmdbImdbId(tmdbKey, m.id);
      if (tt) {
        const full = await fetchCinemeta(narrowMediaType(m.type),tt);
        if (full?.logo) return full.logo;
      }
    }
    return undefined;
  }
  if (
    m.id.startsWith("kitsu:") ||
    m.id.startsWith("mal:") ||
    m.id.startsWith("anilist:") ||
    m.id.startsWith("anidb:")
  ) {
    const akm = await animeKitsuMeta(m.id);
    if (akm?.logo) return akm.logo;
    if (tmdbKey && m.name) {
      const kind = m.type === "movie" ? "movie" : "tv";
      const year = akm?.releaseInfo ?? m.releaseInfo;
      const hit = await tmdbAnimeLogo(tmdbKey, akm?.name ?? m.name, year, kind);
      if (hit?.logo) return hit.logo;
    }
    return undefined;
  }
  return undefined;
}
