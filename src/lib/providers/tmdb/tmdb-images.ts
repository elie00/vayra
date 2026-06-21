import { lruSet } from "@/lib/cache";
import { registerCache } from "@/lib/memory-profiler";
import { loadStoredSettings } from "@/lib/settings/load";
import { get, IMG, tmdbLanguageIso } from "./tmdb-client";

export type LogoEntry = { file_path: string; iso_639_1: string | null; vote_average?: number };

export type RawImages = {
  backdrops?: Array<{ file_path: string; vote_average?: number }>;
  logos?: LogoEntry[];
  posters?: Array<{ file_path: string; vote_average?: number; iso_639_1?: string | null }>;
};

const MOVIE_ASSETS_MAX = 400;
const movieAssetsCache = new Map<string, RawImages>();
const movieAssetsInflight = new Map<string, Promise<RawImages | null>>();

registerCache("tmdb:movieAssets", () => movieAssetsCache.size);

export async function fetchMovieAssets(key: string, metaId: string): Promise<RawImages | null> {
  if (!key) return null;
  const match = metaId.match(/^tmdb:(movie|tv):(\d+)$/);
  if (!match) return null;
  const cached = movieAssetsCache.get(metaId);
  if (cached) return cached;
  const inflight = movieAssetsInflight.get(metaId);
  if (inflight) return inflight;
  const [, kind, id] = match;
  const iso = tmdbLanguageIso();
  const settings = loadStoredSettings();
  const translatePosters = settings.translatePosters && !settings.posterBaseUrl;
  const p = get<RawImages>(key, `${kind}/${id}/images`, {
    include_image_language: translatePosters && iso && iso !== "en" ? `${iso},en,null` : "en,null",
  }).then((data) => {
    movieAssetsInflight.delete(metaId);
    if (data) lruSet(movieAssetsCache, metaId, data, MOVIE_ASSETS_MAX);
    return data;
  });
  movieAssetsInflight.set(metaId, p);
  return p;
}

export const pickLogo = (logos: LogoEntry[]): string | undefined => {
  if (!logos?.length) return undefined;
  const iso = tmdbLanguageIso();
  const score = (l: LogoEntry) => {
    const lang =
      iso && iso !== "en" && l.iso_639_1 === iso
        ? 150
        : l.iso_639_1 === "en"
          ? 100
          : l.iso_639_1 == null
            ? 50
            : 0;
    const isPng = l.file_path?.toLowerCase().endsWith(".png") ? 5 : 0;
    return lang + isPng + (l.vote_average ?? 0);
  };
  const best = [...logos].sort((a, b) => score(b) - score(a))[0];
  return best?.file_path ? `${IMG}/w342${best.file_path}` : undefined;
};

export async function tmdbMovieImages(key: string, metaId: string): Promise<string[]> {
  const data = await fetchMovieAssets(key, metaId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of (data?.backdrops ?? []).sort(
    (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0),
  )) {
    if (!b.file_path || seen.has(b.file_path)) continue;
    seen.add(b.file_path);
    out.push(`${IMG}/w780${b.file_path}`);
    if (out.length >= 12) break;
  }
  return out;
}

export async function tmdbLogo(
  key: string,
  metaId: string,
): Promise<string | undefined> {
  const data = await fetchMovieAssets(key, metaId);
  return pickLogo(data?.logos ?? []);
}
