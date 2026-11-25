import { lruSet } from "@/lib/cache";
import type { Meta } from "../../cinemeta";
import { effectiveTmdbLanguage, get, IMG } from "./tmdb-client";

export type TmdbCollection = {
  id: number;
  name: string;
  displayName: string;
  overview: string;
  poster?: string;
  backdrop?: string;
  cardBackdrop?: string;
  posterStack: string[];
  yearRange: string | null;
  averageRating: string | null;
  releasedCount: number;
  parts: Meta[];
  genreCounts?: Record<number, number>;
};

export type CollectionArtwork = {
  cardBackdrop: string | null;
  heroBackdrop: string | null;
  posters: string[];
};

type RawCollectionPart = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
};

type RawCollectionResponse = {
  id: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  parts?: RawCollectionPart[];
};

type RawImageEntry = {
  file_path?: string;
  iso_639_1?: string | null;
  vote_average?: number;
  vote_count?: number;
  width?: number;
  aspect_ratio?: number;
};

type RawCollectionImages = {
  backdrops?: RawImageEntry[];
  posters?: RawImageEntry[];
};

const CACHE_MAX = 400;
const cache = new Map<string, Promise<TmdbCollection | null>>();
const resolvedCache = new Map<string, TmdbCollection>();
const artworkCache = new Map<number, CollectionArtwork>();
const artworkInflight = new Map<number, Promise<CollectionArtwork | null>>();

function collectionCacheKey(id: number): string {
  const lang = effectiveTmdbLanguage() || "default";
  return `${lang}:${id}`;
}

export function cleanCollectionTitle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/\s*\((?:the\s+)?(?:collection|saga|film\s+series|série(?:\s+de\s+films)?)\)\s*$/i, "")
    .replace(/\s*[-–—:]\s*(?:la\s+|le\s+|the\s+)?(?:collection|saga|film\s+series|série(?:\s+de\s+films)?)\s*$/i, "")
    .replace(/\s+(?:the\s+)?collection\s*$/i, "")
    .trim();
  return cleaned || trimmed;
}

function isReleased(releaseDate?: string, todayIso?: string): boolean {
  if (!releaseDate) return false;
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return releaseDate <= today;
}

export function computeCollectionYearRange(parts: Meta[]): string | null {
  const years = parts
    .map((p) => Number(p.releaseInfo))
    .filter((y) => Number.isFinite(y) && y > 1880);
  if (years.length === 0) return null;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

export function pickCollectionPosterStack(parts: Meta[], fallbackPoster?: string): string[] {
  const withPosters = parts.filter((p): p is Meta & { poster: string } => Boolean(p.poster));
  const releasedWithPosters = withPosters.filter((p) => isReleased(p.releaseDate));
  const pool = releasedWithPosters.length >= 2 ? releasedWithPosters : withPosters;

  const picked: string[] = [];
  const push = (url?: string) => {
    if (!url || picked.includes(url)) return;
    picked.push(url);
  };

  if (pool.length <= 3) {
    for (const item of pool) push(item.poster);
  } else {
    // Pick opening chapter, a middle iconic chapter, and the latest released chapter
    // so long sagas visually span their full era in the VAYRA folio fan.
    push(pool[0]?.poster);
    push(pool[Math.floor((pool.length - 1) / 2)]?.poster);
    push(pool[pool.length - 1]?.poster);
  }

  if (picked.length === 0 && fallbackPoster) push(fallbackPoster);
  return picked.slice(0, 3);
}

function pickPartFallbackBackdrop(parts: RawCollectionPart[]): string | null {
  const withBackdrop = parts.filter((p) => Boolean(p.backdrop_path));
  if (withBackdrop.length === 0) return null;
  const sorted = [...withBackdrop].sort((a, b) => {
    const scoreA = (a.vote_average ?? 0) * Math.log10((a.vote_count ?? 0) + 10) + (a.popularity ?? 0) * 0.05;
    const scoreB = (b.vote_average ?? 0) * Math.log10((b.vote_count ?? 0) + 10) + (b.popularity ?? 0) * 0.05;
    return scoreB - scoreA;
  });
  return sorted[0]?.backdrop_path ?? null;
}

export function pickBestCollectionBackdrop(backdrops: RawImageEntry[]): string | null {
  const valid = backdrops.filter((b): b is RawImageEntry & { file_path: string } => Boolean(b.file_path));
  if (valid.length === 0) return null;
  const score = (b: RawImageEntry) => {
    // Strongly favor textless widescreen artwork so collection covers stay clean
    // without baked-in titles clashing with VAYRA's typography.
    const textlessBonus = b.iso_639_1 == null || b.iso_639_1 === "" ? 120 : 0;
    const hdBonus = (b.width ?? 0) >= 1280 ? 20 : 0;
    const wideBonus = (b.aspect_ratio ?? 1.77) >= 1.6 ? 15 : 0;
    const quality = (b.vote_average ?? 0) * 4 + Math.min(20, Math.log10((b.vote_count ?? 0) + 1) * 10);
    return textlessBonus + hdBonus + wideBonus + quality;
  };
  const best = [...valid].sort((a, b) => score(b) - score(a))[0];
  return best?.file_path ?? null;
}

function computeAverageRating(parts: RawCollectionPart[]): string | null {
  const rated = parts.filter(
    (p) => typeof p.vote_average === "number" && p.vote_average > 0 && (p.vote_count ?? 0) >= 10,
  );
  const pool =
    rated.length > 0
      ? rated
      : parts.filter((p) => typeof p.vote_average === "number" && p.vote_average > 0);
  if (pool.length === 0) return null;
  const sum = pool.reduce((acc, p) => acc + (p.vote_average ?? 0), 0);
  return (Math.round((sum / pool.length) * 10) / 10).toFixed(1);
}

export function peekTmdbCollection(id: number): TmdbCollection | null {
  if (!Number.isFinite(id) || id <= 0) return null;
  return resolvedCache.get(collectionCacheKey(id)) ?? null;
}

export function peekCollectionArtwork(id: number): CollectionArtwork | null {
  if (!Number.isFinite(id) || id <= 0) return null;
  return artworkCache.get(id) ?? null;
}

export function tmdbCollection(key: string, id: number): Promise<TmdbCollection | null> {
  if (!key || !Number.isFinite(id) || id <= 0) return Promise.resolve(null);
  const ck = collectionCacheKey(id);
  const existing = cache.get(ck);
  if (existing) return existing;
  const promise = run(key, id).then((col) => {
    if (col) lruSet(resolvedCache, ck, col, CACHE_MAX);
    else cache.delete(ck);
    return col;
  });
  lruSet(cache, ck, promise, CACHE_MAX);
  return promise;
}

async function run(key: string, id: number): Promise<TmdbCollection | null> {
  const raw = await get<RawCollectionResponse>(key, `collection/${id}`);
  if (!raw) return null;
  const rawParts = raw.parts ?? [];
  const genreCounts: Record<number, number> = {};
  for (const p of rawParts) {
    for (const g of p.genre_ids ?? []) {
      genreCounts[g] = (genreCounts[g] ?? 0) + 1;
    }
  }
  const parts: Meta[] = rawParts
    .map(
      (p): Meta => ({
        id: `tmdb:movie:${p.id}`,
        type: "movie",
        name: p.title ?? p.name ?? "",
        poster: p.poster_path ? `${IMG}/w342${p.poster_path}` : undefined,
        background: p.backdrop_path ? `${IMG}/w780${p.backdrop_path}` : undefined,
        description: p.overview,
        releaseInfo: (p.release_date ?? "").slice(0, 4) || undefined,
        releaseDate: p.release_date || undefined,
        imdbRating:
          typeof p.vote_average === "number" && p.vote_average > 0
            ? Number(p.vote_average).toFixed(1)
            : undefined,
      }),
    )
    .sort((a: Meta, b: Meta) => (a.releaseDate ?? "zzz").localeCompare(b.releaseDate ?? "zzz"));

  const todayIso = new Date().toISOString().slice(0, 10);
  const releasedCount = parts.filter((p) => !p.releaseDate || isReleased(p.releaseDate, todayIso)).length;
  const backdropPath = raw.backdrop_path || pickPartFallbackBackdrop(rawParts);
  const poster = raw.poster_path ? `${IMG}/w342${raw.poster_path}` : undefined;
  const name = raw.name ?? "";

  return {
    id: raw.id,
    name,
    displayName: cleanCollectionTitle(name),
    overview: raw.overview ?? "",
    poster,
    backdrop: backdropPath ? `${IMG}/w1280${backdropPath}` : undefined,
    cardBackdrop: backdropPath ? `${IMG}/w780${backdropPath}` : undefined,
    posterStack: pickCollectionPosterStack(parts, poster),
    yearRange: computeCollectionYearRange(parts),
    averageRating: computeAverageRating(rawParts),
    releasedCount,
    parts,
    genreCounts,
  };
}

export async function tmdbCollectionImages(
  key: string,
  id: number,
): Promise<CollectionArtwork | null> {
  if (!key || !Number.isFinite(id) || id <= 0) return null;
  const cached = artworkCache.get(id);
  if (cached) return cached;
  const inflight = artworkInflight.get(id);
  if (inflight) return inflight;
  const p = get<RawCollectionImages>(key, `collection/${id}/images`, {
    include_image_language: "null,en,fr",
  })
    .then((raw) => {
      artworkInflight.delete(id);
      if (!raw) return null;
      const bestPath = pickBestCollectionBackdrop(raw.backdrops ?? []);
      const posters = (raw.posters ?? [])
        .filter((item): item is RawImageEntry & { file_path: string } => Boolean(item.file_path))
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, 3)
        .map((item) => `${IMG}/w342${item.file_path}`);
      const art: CollectionArtwork = {
        cardBackdrop: bestPath ? `${IMG}/w780${bestPath}` : null,
        heroBackdrop: bestPath ? `${IMG}/w1280${bestPath}` : null,
        posters,
      };
      lruSet(artworkCache, id, art, CACHE_MAX);
      return art;
    })
    .catch(() => {
      /* best-effort curated artwork upgrade; collection fallback remains active */
      artworkInflight.delete(id);
      return null;
    });
  artworkInflight.set(id, p);
  return p;
}

const searchCache = new Map<string, Promise<number | null>>();

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(?:collection|trilogy|saga|series|anthology|the|007)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function collectionNameMatches(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return long.startsWith(`${short} `);
}

export function tmdbSearchCollectionId(key: string, query: string): Promise<number | null> {
  if (!key || !query) return Promise.resolve(null);
  const ck = query.toLowerCase();
  const existing = searchCache.get(ck);
  if (existing) return existing;
  const promise = runSearch(key, query);
  searchCache.set(ck, promise);
  return promise;
}

async function runSearch(key: string, query: string): Promise<number | null> {
  const raw = await get<{ results?: Array<{ id: number; name?: string }> }>(
    key,
    "search/collection",
    { query },
  );
  const results = raw?.results ?? [];
  if (results.length === 0) return null;
  const want = normName(query);
  const exact = results.find((r) => normName(r.name ?? "") === want);
  if (exact) return exact.id;
  const contains = results.find((r) => collectionNameMatches(r.name ?? "", query));
  return (contains ?? results[0])?.id ?? null;
}

export type CollectionHit = { id: number; name: string; backdrop: string | null };

export async function tmdbSearchCollections(
  key: string,
  query: string,
  page = 1,
): Promise<{ hits: CollectionHit[]; totalPages: number }> {
  if (!key || !query.trim()) return { hits: [], totalPages: 0 };
  const raw = await get<{
    results?: Array<{ id: number; name?: string; backdrop_path?: string | null }>;
    total_pages?: number;
  }>(key, "search/collection", { query, page: String(page) });
  const hits = (raw?.results ?? [])
    .filter((r) => Number.isFinite(r.id) && r.name)
    .map((r) => ({
      id: r.id,
      name: r.name ?? "",
      backdrop: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : null,
    }));
  return { hits, totalPages: Math.min(raw?.total_pages ?? 0, 500) };
}

export function tmdbCollectionsFeed(
  key: string,
  page: number,
): Promise<{ hits: CollectionHit[]; totalPages: number }> {
  return tmdbSearchCollections(key, "collection", page);
}
