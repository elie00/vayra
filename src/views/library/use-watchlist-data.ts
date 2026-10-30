// The watchlist as one list: titles saved on this device, the Stremio library
// and Trakt, merged; shared by the library tab and the phone's My list page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { library, removeStremioLibraryItem, type LibraryItem } from "@/lib/stremio";
import { filterLibrary, mergeWatchlist } from "@/lib/watchlist-merge";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import { useTrakt } from "@/lib/trakt/provider";
import type { TraktItem } from "@/lib/trakt/types";
import { readLocalEntries, removeFromWatchlist, setWatchlistAggregate, subscribeWatchlist, type LocalEntry } from "@/lib/watchlist";

export function useWatchlistData() {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const [stremio, setStremio] = useState<LibraryItem[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [trakt, setTrakt] = useState<TraktItem[]>([]);
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>(() => readLocalEntries());
  const [traktStatus, setTraktStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const tick = () => setLocalEntries(readLocalEntries());
    window.addEventListener("storage", tick);
    const unsub = subscribeWatchlist(tick);
    return () => {
      window.removeEventListener("storage", tick);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authKey) return;
    let cancelled = false;
    library(authKey)
      .then((items) => {
        if (cancelled) return;
        setRawCount(items.filter((i) => !i.removed).length);
        setStremio(filterLibrary(items, settings.libraryBookmarkedOnly));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey, settings.libraryBookmarkedOnly]);

  const handleRemove = useCallback(
    async (stremioId: string) => {
      if (!authKey) return;
      const wasLocal = readLocalEntries().some((e) => e.id === stremioId);
      setStremio((prev) => prev.filter((i) => i._id !== stremioId));
      setRawCount((c) => Math.max(0, c - 1));
      try {
        await removeStremioLibraryItem(authKey, stremioId);
        if (wasLocal) removeFromWatchlist(stremioId);
      } catch {
        library(authKey)
          .then((items) => {
            setRawCount(items.filter((i) => !i.removed).length);
            setStremio(filterLibrary(items, settings.libraryBookmarkedOnly));
          })
          .catch(() => {});
      }
    },
    [authKey, settings.libraryBookmarkedOnly],
  );

  useEffect(() => {
    if (!traktConnected) {
      setTrakt([]);
      setTraktStatus("idle");
      return;
    }
    let cancelled = false;
    setTraktStatus("loading");
    fetchWatchlist()
      .then((items) => {
        if (!cancelled) {
          setTrakt(items);
          setTraktStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setTraktStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  const merged = useMemo(
    () => mergeWatchlist(localEntries, stremio, trakt),
    [localEntries, stremio, trakt],
  );

  useEffect(() => {
    const ids = new Set<string>();
    for (const it of stremio) ids.add(it._id);
    for (const t of trakt) {
      if (t.ids.imdb) ids.add(t.ids.imdb);
      if (t.ids.tmdb) {
        ids.add(t.type === "movie" ? `tmdb:movie:${t.ids.tmdb}` : `tmdb:tv:${t.ids.tmdb}`);
      }
    }
    for (const e of localEntries) ids.add(e.id);
    setWatchlistAggregate(ids);
  }, [stremio, trakt, localEntries]);

  return { merged, handleRemove, authKey, trakt, traktConnected, traktStatus, localEntries, rawCount };
}
