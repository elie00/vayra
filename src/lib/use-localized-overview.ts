import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { tmdbMetadataOverview } from "@/lib/providers/tmdb/tmdb-lite";
import { useSettings } from "@/lib/settings";

/**
 * Returns a title's plot in the metadata language (English by default), fetched
 * per-title so it stays readable even when the Image languages setting localizes
 * list requests. Falls back to the catalog description until the fetch resolves.
 */
export function useLocalizedOverview(meta: Meta): string | undefined {
  const { settings } = useSettings();
  const isTmdb = meta.id.startsWith("tmdb:");
  // For TMDB items the catalog description is in the (image) request language, so
  // hold it back until the metadata-language text loads — avoids an Arabic→English
  // flash. Non-TMDB descriptions are already in the right language, so show them.
  const [overview, setOverview] = useState<string | undefined>(
    isTmdb ? undefined : meta.description,
  );
  useEffect(() => {
    if (!isTmdb || !settings.tmdbKey) {
      setOverview(meta.description);
      return;
    }
    setOverview(undefined);
    let alive = true;
    void tmdbMetadataOverview(settings.tmdbKey, meta.id).then((o) => {
      if (alive) setOverview(o ?? meta.description);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, settings.tmdbKey]);
  return overview;
}
