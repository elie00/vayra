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
