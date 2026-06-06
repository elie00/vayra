import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { library } from "@/lib/stremio";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import { useTrakt } from "@/lib/trakt/provider";
import { setWatchlistAggregate } from "@/lib/watchlist";

const STORE: { stremio: string[]; trakt: string[] } = { stremio: [], trakt: [] };

function pushAggregate() {
  setWatchlistAggregate([...STORE.stremio, ...STORE.trakt]);
}

export function WatchlistSync() {
  const { authKey } = useAuth();
  const { isConnected: traktConnected } = useTrakt();

  useEffect(() => {
    if (!authKey) {
      STORE.stremio = [];
      pushAggregate();
      return;
    }
    let cancelled = false;
    library(authKey)
      .then((items) => {
        if (cancelled) return;
        const ids: string[] = [];
        for (const it of items) {
          if (it.removed || it.temp) continue;
          ids.push(it._id);
        }
        STORE.stremio = ids;
        pushAggregate();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  useEffect(() => {
    if (!traktConnected) {
      STORE.trakt = [];
      pushAggregate();
      return;
    }
    let cancelled = false;
    fetchWatchlist()
      .then((items) => {
        if (cancelled) return;
        const ids: string[] = [];
        for (const t of items) {
          if (t.ids.imdb) ids.push(t.ids.imdb);
          if (t.ids.tmdb) {
            ids.push(t.type === "movie" ? `tmdb:movie:${t.ids.tmdb}` : `tmdb:tv:${t.ids.tmdb}`);
          }
        }
        STORE.trakt = ids;
        pushAggregate();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  return null;
}
