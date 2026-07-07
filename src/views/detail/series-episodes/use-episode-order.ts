import { useEffect, useState } from "react";
import { fetchTvdbOrder, type TvdbOrder } from "@/lib/providers/tvdb-order";

export function useEpisodeOrder(
  imdbId: string | null,
  provider: "default" | "tmdb" | "tvdb",
  seasonType: string,
  tvdbKey: string,
): TvdbOrder | null {
  const [order, setOrder] = useState<TvdbOrder | null>(null);
  const active = provider === "tvdb" && !!tvdbKey && !!imdbId && imdbId.startsWith("tt");

  useEffect(() => {
    if (!active || !imdbId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    void fetchTvdbOrder(tvdbKey, imdbId, seasonType).then((o) => {
      if (!cancelled) setOrder(o);
    });
    return () => {
      cancelled = true;
    };
  }, [active, imdbId, tvdbKey, seasonType]);

  return active ? order : null;
}
