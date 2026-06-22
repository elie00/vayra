import type { Meta } from "@/lib/cinemeta";
import { anilistRequest } from "./client";
import { anilistMediaToMeta } from "./to-meta";
import type { AnilistMedia } from "./types";
import { adultContentHidden } from "@/lib/addons-store/adult-filter";

const BROWSE_QUERY = `query ($page: Int, $perPage: Int, $sort: [MediaSort], $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: $sort, isAdult: $isAdult) {
      id
      idMal
      title { romaji english native userPreferred }
      coverImage { extraLarge large medium }
      bannerImage
      format
      episodes
      averageScore
      seasonYear
    }
  }
}`;

type BrowseResponse = { Page: { media: AnilistMedia[] } | null };

async function fetchAnilistBrowse(sort: string, count: number): Promise<Meta[]> {
  const perPage = Math.min(50, count);
  const pages = Math.ceil(count / perPage);
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      anilistRequest<BrowseResponse>(
        BROWSE_QUERY,
        { page: i + 1, perPage, sort: [sort], isAdult: adultContentHidden() ? false : null },
        undefined,
        true,
      ).catch(() => null),
    ),
  );
  const out: Meta[] = [];
  const seen = new Set<string>();
  for (const data of responses) {
    for (const m of data?.Page?.media ?? []) {
      const meta = anilistMediaToMeta(m);
      if (!meta || seen.has(meta.id)) continue;
      seen.add(meta.id);
      out.push(meta);
    }
  }
  return out.slice(0, count);
}

const BANNER_QUERY = `query ($search: String) {
  Media(type: ANIME, search: $search) {
    bannerImage
  }
}`;

const bannerCache = new Map<string, string | null>();

export async function anilistBannerByTitle(title: string): Promise<string | undefined> {
  const key = title.trim().toLowerCase();
  if (!key) return undefined;
  if (bannerCache.has(key)) return bannerCache.get(key) ?? undefined;
  try {
    const data = await anilistRequest<{ Media: { bannerImage: string | null } | null }>(
      BANNER_QUERY,
      { search: title },
      undefined,
      true,
    );
    const url = data?.Media?.bannerImage ?? null;
    bannerCache.set(key, url);
    return url ?? undefined;
  } catch {
    bannerCache.set(key, null);
    return undefined;
  }
}

export function fetchAnilistTopAnime(count = 100): Promise<Meta[]> {
  return fetchAnilistBrowse("SCORE_DESC", count);
}

export function fetchAnilistTrendingAnime(count = 40): Promise<Meta[]> {
  return fetchAnilistBrowse("TRENDING_DESC", count);
}
