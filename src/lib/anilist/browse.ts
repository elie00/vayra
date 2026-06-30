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

const ART_BY_ID_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    bannerImage
    coverImage { extraLarge }
  }
}`;

const artByIdCache = new Map<number, { banner?: string; cover?: string }>();

export async function anilistArtById(id: number): Promise<{ banner?: string; cover?: string }> {
  const cached = artByIdCache.get(id);
  if (cached) return cached;
  try {
    const data = await anilistRequest<{
      Media: { bannerImage: string | null; coverImage: { extraLarge: string | null } | null } | null;
    }>(ART_BY_ID_QUERY, { id }, undefined, true);
    const art = {
      banner: data?.Media?.bannerImage ?? undefined,
      cover: data?.Media?.coverImage?.extraLarge ?? undefined,
    };
    artByIdCache.set(id, art);
    return art;
  } catch {
    const empty = {};
    artByIdCache.set(id, empty);
    return empty;
  }
}

export function fetchAnilistTopAnime(count = 100): Promise<Meta[]> {
  return fetchAnilistBrowse("SCORE_DESC", count);
}

export function fetchAnilistTrendingAnime(count = 40): Promise<Meta[]> {
  return fetchAnilistBrowse("TRENDING_DESC", count);
}
