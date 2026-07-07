import { useEffect, useState } from "react";
import { simklRequest } from "./client";
import type { SimklIds, SimklTarget } from "./types";
import { updateCachedRatingByTarget, getCachedRatingByTarget } from "./activities";

export { getCachedRatingByTarget };

/* ─── SIMKL community rating hook ─────────────────────────────────────────── */

/** Module-level cache: IMDb ID → community rating (or null when lookup failed). */
const communityRatingCache = new Map<string, number | null>();

interface SimklSearchIdItem {
  type?: string;
  ids?: { simkl?: number };
  ratings?: { simkl?: { rating?: number } };
}

interface SimklDetailResponse {
  ratings?: { simkl?: { rating?: number } };
}

/**
 * Fetch the SIMKL community rating for a title by its IMDb ID, independently of
 * MDBList.  Uses the public `/search/id` endpoint (only `client_id` required)
 * to resolve the IMDb ID to a SIMKL ID + media type, then fetches the rating
 * from the appropriate detail endpoint.
 *
 * Results are cached in-memory per IMDb ID to avoid repeated API calls.
 */
export function useSimklCommunityRating(
  imdbId: string | null,
): { rating: number | null; loading: boolean } {
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imdbId) {
      setRating(null);
      setLoading(false);
      return;
    }

    // Serve from cache if available
    if (communityRatingCache.has(imdbId)) {
      setRating(communityRatingCache.get(imdbId) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Step 1 — resolve IMDb ID → SIMKL ID + type via /search/id (public)
        const results = await simklRequest<SimklSearchIdItem[]>(
          `/search/id?imdb=${encodeURIComponent(imdbId)}`,
          { method: "GET", authed: false },
        );

        if (!Array.isArray(results) || results.length === 0) {
          if (!cancelled) {
            communityRatingCache.set(imdbId, null);
            setRating(null);
            setLoading(false);
          }
          return;
        }

        const item = results[0];

        // Fast path: some responses include ratings directly
        const directRating = item.ratings?.simkl?.rating;
        if (directRating != null) {
          if (!cancelled) {
            communityRatingCache.set(imdbId, directRating);
            setRating(directRating);
            setLoading(false);
          }
          return;
        }

        // Step 2 — fetch from the detail endpoint for the media type
        const simklId = item.ids?.simkl;
        if (simklId == null) {
          if (!cancelled) {
            communityRatingCache.set(imdbId, null);
            setRating(null);
            setLoading(false);
          }
          return;
        }

        const type = item.type; // "movie" | "tv" | "anime"
        const detailPath =
          type === "movie"
            ? `/movies/${simklId}`
            : type === "anime"
              ? `/anime/${simklId}`
              : `/tv/${simklId}`;

        const detail = await simklRequest<SimklDetailResponse>(detailPath, {
          method: "GET",
          authed: false,
        });

        const communityRating = detail.ratings?.simkl?.rating ?? null;

        if (!cancelled) {
          communityRatingCache.set(imdbId, communityRating);
          setRating(communityRating);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          communityRatingCache.set(imdbId, null);
          setRating(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imdbId]);

  return { rating, loading };
}

/* ─── SIMKL card scores hook (for poster badges) ───────────────────────────── */

/**
 * Module-level cache + in-flight deduplication for SIMKL community scores by IMDb ID.
 * Shared across all poster cards to avoid redundant API calls.
 */
const cardScoreCache = new Map<string, number | null>();
const cardScoreInFlight = new Map<string, Promise<number | null>>();

/**
 * Resolve a single IMDb ID to a SIMKL community rating.
 * Uses the same /search/id fast-path as useSimklCommunityRating.
 * Results are cached in-memory.
 */
async function resolveSimklCardScore(imdbId: string): Promise<number | null> {
  if (cardScoreCache.has(imdbId)) {
    return cardScoreCache.get(imdbId) ?? null;
  }
  if (cardScoreInFlight.has(imdbId)) {
    return cardScoreInFlight.get(imdbId)!;
  }

  const promise = (async () => {
    try {
      const results = await simklRequest<SimklSearchIdItem[]>(
        `/search/id?imdb=${encodeURIComponent(imdbId)}`,
        { method: "GET", authed: false },
      );
      if (!Array.isArray(results) || results.length === 0) {
        cardScoreCache.set(imdbId, null);
        return null;
      }
      const item = results[0];
      const directRating = item.ratings?.simkl?.rating;
      if (directRating != null) {
        cardScoreCache.set(imdbId, directRating);
        return directRating;
      }
      const simklId = item.ids?.simkl;
      if (simklId == null) {
        cardScoreCache.set(imdbId, null);
        return null;
      }
      const type = item.type;
      const detailPath =
        type === "movie" ? `/movies/${simklId}` : type === "anime" ? `/anime/${simklId}` : `/tv/${simklId}`;
      const detail = await simklRequest<SimklDetailResponse>(detailPath, {
        method: "GET",
        authed: false,
      });
      const rating = detail.ratings?.simkl?.rating ?? null;
      cardScoreCache.set(imdbId, rating);
      return rating;
    } catch {
      cardScoreCache.set(imdbId, null);
      return null;
    } finally {
      cardScoreInFlight.delete(imdbId);
    }
  })();

  cardScoreInFlight.set(imdbId, promise);
  return promise;
}

/**
 * React hook that returns the SIMKL community score for a given IMDb ID.
 * Designed for use in poster cards (PickCard). Independent of MDBList.
 * Results are cached in-memory and shared across all cards.
 */
export function useSimklCardScores(imdbId: string | undefined): { score: number | null; loading: boolean } {
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imdbId) {
      setScore(null);
      setLoading(false);
      return;
    }
    if (cardScoreCache.has(imdbId)) {
      setScore(cardScoreCache.get(imdbId) ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveSimklCardScore(imdbId).then((result) => {
      if (!cancelled) {
        setScore(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [imdbId]);

  return { score, loading };
}

/* ─── SIMKL card scores by anime ID (MAL/Kitsu/AniDB/AniList) ─────────────── */

/**
 * Module-level cache + in-flight dedup for SIMKL community scores by anime ID.
 * Keys are namespaced as "anime:{source}:{id}" to avoid collision with IMDb cache.
 */
const animeScoreCache = new Map<string, number | null>();
const animeScoreInFlight = new Map<string, Promise<number | null>>();

/**
 * Map anime ID prefix to the SIMKL /search/id query parameter name.
 */
const ANIME_ID_PARAM: Record<string, string> = {
  mal: "mal",
  kitsu: "kitsu",
  anidb: "anidb",
  anilist: "anilist",
};

/**
 * Resolve a single anime ID (e.g. "mal:16498") to a SIMKL community rating.
 * Uses /search/id?{source}={id} — the SIMKL API supports mal, kitsu, anidb, anilist params.
 * Results are cached in-memory.
 */
async function resolveSimklCardScoreByAnimeId(animeId: string): Promise<number | null> {
  const cacheKey = `anime:${animeId}`;
  if (animeScoreCache.has(cacheKey)) {
    return animeScoreCache.get(cacheKey) ?? null;
  }
  if (animeScoreInFlight.has(cacheKey)) {
    return animeScoreInFlight.get(cacheKey)!;
  }

  // Parse the anime ID prefix
  const simklMatch = animeId.match(/^simkl:(\d+)$/);
  const externalMatch = animeId.match(/^(mal|kitsu|anidb|anilist):(\d+)$/);

  if (!simklMatch && !externalMatch) {
    animeScoreCache.set(cacheKey, null);
    return null;
  }

  // Capture resolved values before async closure (TypeScript null-safety)
  const resolvedSimklId = simklMatch ? Number(simklMatch[1]) : null;
  const resolvedParam = externalMatch ? ANIME_ID_PARAM[externalMatch[1]] : null;
  const resolvedIdValue = externalMatch ? externalMatch[2] : null;

  const promise = (async () => {
    try {
      // Direct SIMKL ID — skip /search/id, go straight to detail endpoint
      if (resolvedSimklId != null) {
        // Try anime endpoint first (most simkl: IDs in our context are anime)
        const detail = await simklRequest<SimklDetailResponse>(
          `/anime/${resolvedSimklId}`,
          { method: "GET", authed: false },
        );
        const rating = detail.ratings?.simkl?.rating ?? null;
        animeScoreCache.set(cacheKey, rating);
        return rating;
      }

      // External ID (mal/kitsu/anidb/anilist) — resolve via /search/id
      if (resolvedParam == null || resolvedIdValue == null) {
        animeScoreCache.set(cacheKey, null);
        return null;
      }
      const param = resolvedParam;
      const idValue = resolvedIdValue;
      const results = await simklRequest<SimklSearchIdItem[]>(
        `/search/id?${param}=${encodeURIComponent(idValue)}`,
        { method: "GET", authed: false },
      );
      if (!Array.isArray(results) || results.length === 0) {
        animeScoreCache.set(cacheKey, null);
        return null;
      }
      const item = results[0];
      const directRating = item.ratings?.simkl?.rating;
      if (directRating != null) {
        animeScoreCache.set(cacheKey, directRating);
        return directRating;
      }
      const simklId = item.ids?.simkl;
      if (simklId == null) {
        animeScoreCache.set(cacheKey, null);
        return null;
      }
      const type = item.type;
      const detailPath =
        type === "movie" ? `/movies/${simklId}` : type === "anime" ? `/anime/${simklId}` : `/tv/${simklId}`;
      const detail = await simklRequest<SimklDetailResponse>(detailPath, {
        method: "GET",
        authed: false,
      });
      const rating = detail.ratings?.simkl?.rating ?? null;
      animeScoreCache.set(cacheKey, rating);
      return rating;
    } catch {
      animeScoreCache.set(cacheKey, null);
      return null;
    } finally {
      animeScoreInFlight.delete(cacheKey);
    }
  })();

  animeScoreInFlight.set(cacheKey, promise);
  return promise;
}

/**
 * React hook that returns the SIMKL community score for a given anime ID
 * (e.g. "mal:16498", "kitsu:12345"). Designed for use in poster cards (PickCard)
 * for anime items that don't have IMDb IDs. Independent of MDBList.
 * Results are cached in-memory and shared across all cards.
 */
export function useSimklCardScoresByAnimeId(
  animeId: string | undefined,
): { score: number | null; loading: boolean } {
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!animeId) {
      setScore(null);
      setLoading(false);
      return;
    }
    const cacheKey = `anime:${animeId}`;
    if (animeScoreCache.has(cacheKey)) {
      setScore(animeScoreCache.get(cacheKey) ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveSimklCardScoreByAnimeId(animeId).then((result) => {
      if (!cancelled) {
        setScore(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  return { score, loading };
}

/* ─── User rating CRUD ─────────────────────────────────────────────────────── */

function getRatingPayload(target: SimklTarget): { key: string; ids: SimklIds } {
  const isMovie = target.kind === "movie";
  const isAnime = target.kind === "anime" || target.kind === "anime-episode";

  const ids =
    target.kind === "episode"
      ? target.show.ids
      : target.kind === "anime-episode"
        ? target.anime.ids
        : target.ids;

  const key = isMovie ? "movies" : isAnime ? "anime" : "shows";
  return { key, ids };
}

export async function addSimklRating(target: SimklTarget, rating: number): Promise<boolean> {
  const { key, ids } = getRatingPayload(target);
  try {
    await simklRequest("/sync/ratings", {
      method: "POST",
      body: {
        [key]: [{ rating, ids }],
      },
    });
    updateCachedRatingByTarget(target, rating);
    return true;
  } catch (e) {
    console.error("Failed to add SIMKL rating", e);
    return false;
  }
}

export async function removeSimklRating(target: SimklTarget): Promise<boolean> {
  const { key, ids } = getRatingPayload(target);
  try {
    await simklRequest("/sync/ratings/remove", {
      method: "POST",
      body: {
        [key]: [{ ids }],
      },
    });
    updateCachedRatingByTarget(target, null);
    return true;
  } catch (e) {
    console.error("Failed to remove SIMKL rating", e);
    return false;
  }
}
