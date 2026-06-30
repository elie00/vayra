import { lruSet } from "@/lib/cache";
import type { Meta } from "@/lib/cinemeta";
import { registerCache } from "@/lib/memory-profiler";
import { registerEvictable } from "@/lib/maintenance";
import { anilistArtById } from "@/lib/anilist/browse";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import { kitsuToAnilist } from "@/lib/providers/anime-mapping";
import { kitsuCoverImage, parseKitsuId } from "@/lib/providers/kitsu";
import { tmdbAnimeLogo } from "@/lib/providers/tmdb";

const GOOD_W = 1280;
const GOOD_H = 720;
const CACHE_MAX = 600;
const cache = new Map<string, string | undefined>();
const inflight = new Map<string, Promise<string | undefined>>();

registerCache("anime:backdrop", () => cache.size);
registerEvictable("anime-backdrop", (aggressive) => {
  if (aggressive) cache.clear();
});

const isAnimeId = (id: string) => /^(kitsu|mal|anilist|anidb):/.test(id);

function probeSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (w: number, h: number) => {
      if (done) return;
      done = true;
      resolve({ w, h });
    };
    const timer = window.setTimeout(() => finish(0, 0), 7000);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img.naturalWidth || 0, img.naturalHeight || 0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(0, 0);
    };
    img.src = url;
  });
}

type Producer = () => Promise<string | undefined>;

async function pickHiRes(producers: Producer[]): Promise<string | undefined> {
  let best: string | undefined;
  let bestArea = 0;
  let fallback: string | undefined;
  let fallbackWidth = 0;
  const seen = new Set<string>();
  for (const produce of producers) {
    const url = await produce().catch(() => undefined);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const { w, h } = await probeSize(url);
    if (w >= GOOD_W && h >= GOOD_H) return url;
    if (w >= GOOD_W) {
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = url;
      }
    } else if (w > fallbackWidth) {
      fallbackWidth = w;
      fallback = url;
    }
  }
  return best ?? fallback;
}

export async function resolveHeroBackdrop(tmdbKey: string, meta: Meta): Promise<string | undefined> {
  if (!isAnimeId(meta.id)) return meta.background ?? meta.poster;
  if (cache.has(meta.id)) return cache.get(meta.id);
  const existing = inflight.get(meta.id);
  if (existing) return existing;
  const p = (async () => {
    const akm = await animeKitsuMeta(meta.id).catch(() => null);
    const name = akm?.name ?? meta.name ?? "";
    const kind: "movie" | "tv" = meta.type === "movie" ? "movie" : "tv";
    const year = akm?.releaseInfo ?? meta.releaseInfo;
    const kitsuId = parseKitsuId(meta.id);
    let anilistId = meta.id.startsWith("anilist:") ? Number(meta.id.split(":")[1]) || null : null;
    const producers: Producer[] = [
      async () =>
        tmdbKey && name ? (await tmdbAnimeLogo(tmdbKey, name, year, kind))?.backdrop : undefined,
      async () => {
        if (anilistId == null && kitsuId != null) anilistId = await kitsuToAnilist(kitsuId);
        return anilistId != null ? (await anilistArtById(anilistId)).banner : undefined;
      },
      async () => (anilistId != null ? (await anilistArtById(anilistId)).cover : undefined),
      async () => (kitsuId != null ? (await kitsuCoverImage(kitsuId)) ?? undefined : undefined),
      async () => meta.background,
      async () => meta.poster,
    ];
    return (await pickHiRes(producers)) ?? meta.background ?? meta.poster;
  })().then((url) => {
    lruSet(cache, meta.id, url, CACHE_MAX);
    inflight.delete(meta.id);
    return url;
  });
  inflight.set(meta.id, p);
  return p;
}
