import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { localizedMetadataOverview } from "@/lib/metadata-overview";
import { effectiveTmdbLanguage } from "@/lib/providers/tmdb/tmdb-client";
import { useSettings } from "@/lib/settings";

export function useLocalizedOverview(meta: Meta | undefined): string | undefined {
  const { settings } = useSettings();
  const language = settings.translateDescriptions ? effectiveTmdbLanguage() || "en" : "en";
  const id = meta?.id;
  const type = meta?.type;
  const fallback = meta?.description;
  const requestKey = `${id}|${type}|${language}|${settings.tmdbKey}`;
  const [result, setResult] = useState<{ key: string; overview?: string } | null>(null);
  useEffect(() => {
    if (!id || !type || !settings.tmdbKey) return;
    let alive = true;
    void localizedMetadataOverview(settings.tmdbKey, { id, type, name: "" }, language)
      .then((overview) => {
        if (alive) setResult({ key: requestKey, overview });
      })
      .catch(() => {
        if (alive) setResult({ key: requestKey });
      });
    return () => {
      alive = false;
    };
  }, [id, type, language, requestKey, settings.tmdbKey]);
  return result?.key === requestKey ? result.overview ?? fallback : fallback;
}
