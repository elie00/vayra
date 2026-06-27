import { useEffect, useState } from "react";
import { meta as fetchCinemetaMeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { useOmdbScores } from "@/lib/providers/omdb";

export function useImdbRating(meta: Meta, resolvedImdb?: string | null): string | undefined {
  const omdb = useOmdbScores(resolvedImdb ?? undefined);
  const [cinemetaRating, setCinemetaRating] = useState<string | undefined>(undefined);
  const isImdbId = meta.id.startsWith("tt");
  useEffect(() => {
    setCinemetaRating(undefined);
    if (isImdbId || !resolvedImdb || !resolvedImdb.startsWith("tt")) return;
    let cancelled = false;
    fetchCinemetaMeta(narrowMediaType(meta.type), resolvedImdb)
      .then((full) => {
        if (!cancelled && full?.imdbRating) setCinemetaRating(full.imdbRating);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isImdbId, resolvedImdb, meta.type]);
  return omdb?.imdbRating ?? cinemetaRating ?? meta.imdbRating;
}
