import { useEffect, useMemo, useState } from "react";
import { fetchWatchedHistory, type SimklHistoryItem } from "@/lib/simkl/history";
import { fetchWatchlist } from "@/lib/simkl/watchlist";
import { simklItemToMeta } from "@/lib/simkl/to-meta";
import type { SimklItem } from "@/lib/simkl/types";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  applyFilter,
  countByType,
  FilterBar,
  GroupedGrid,
  parseTs,
  SortControl,
  sortedGroups,
  type TypeKey,
  type WatchlistMerged,
} from "./shared";

function historyToDated(items: SimklHistoryItem[]): WatchlistMerged[] {
  const seen = new Set<string>();
  const out: WatchlistMerged[] = [];
  for (const h of items) {
    const id =
      h.type === "movie"
        ? h.imdb ?? (h.tmdb ? `tmdb:movie:${h.tmdb}` : null)
        : h.showImdb ?? (h.showTmdb ? `tmdb:tv:${h.showTmdb}` : null);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      key: `sh-${id}`,
      meta: { id, type: h.type === "movie" ? "movie" : "series", name: h.title },
      date: parseTs(h.watchedAt),
    });
  }
  return out;
}

export function SimklTab() {
  const tr = useT();
  const { settings } = useSettings();
  const [watchlist, setWatchlist] = useState<SimklItem[]>([]);
  const [history, setHistory] = useState<SimklHistoryItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([fetchWatchlist(), fetchWatchedHistory(200)])
      .then(([w, h]) => {
        if (cancelled) return;
        setWatchlist(w);
        setHistory(h);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const watchlistEntries = useMemo<WatchlistMerged[]>(
    () =>
      watchlist
        .map((t) => {
          const meta = simklItemToMeta(t);
          if (!meta) return null;
          return { key: `sw-${meta.id}`, meta, date: parseTs(t.watchedAt) };
        })
        .filter((x): x is WatchlistMerged => !!x),
    [watchlist],
  );
  const historyEntries = useMemo(() => historyToDated(history), [history]);

  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");
  const combined = useMemo(
    () => [...watchlistEntries, ...historyEntries],
    [watchlistEntries, historyEntries],
  );
  const counts = useMemo(() => countByType(combined), [combined]);
  const visibleW = useMemo(
    () => applyFilter(watchlistEntries, type, query),
    [watchlistEntries, type, query],
  );
  const visibleH = useMemo(
    () => applyFilter(historyEntries, type, query),
    [historyEntries, type, query],
  );

  return (
    <section className="flex flex-col gap-10">
      {watchlistEntries.length + historyEntries.length > 0 && (
        <FilterBar
          type={type}
          setType={setType}
          query={query}
          setQuery={setQuery}
          counts={counts}
          trailing={<SortControl />}
        />
      )}
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[18px] font-semibold text-ink">{tr("Simkl plan to watch")}</h2>
          <span className="text-[12px] text-ink-muted">
            {tr("{shown} of {total}", { shown: visibleW.length, total: watchlistEntries.length })}
          </span>
        </div>
        {status === "loading" ? (
          <p className="text-[13px] text-ink-muted">{tr("Loading…")}</p>
        ) : visibleW.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            {watchlistEntries.length === 0
              ? tr("Nothing on your Simkl plan-to-watch yet.")
              : tr("No matches for these filters.")}
          </p>
        ) : (
          <GroupedGrid groups={sortedGroups(visibleW, settings.librarySort)} />
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[18px] font-semibold text-ink">{tr("Simkl history")}</h2>
          <span className="text-[12px] text-ink-muted">
            {tr("{shown} of {total}", { shown: visibleH.length, total: historyEntries.length })}
          </span>
        </div>
        {status === "loading" ? (
          <p className="text-[13px] text-ink-muted">{tr("Loading…")}</p>
        ) : visibleH.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            {historyEntries.length === 0 ? tr("No Simkl history yet.") : tr("No matches for these filters.")}
          </p>
        ) : (
          <GroupedGrid groups={sortedGroups(visibleH, settings.librarySort)} />
        )}
      </div>
      {status === "error" && (
        <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12px] text-danger ring-1 ring-danger/30">
          {tr("Couldn't reach Simkl. Try refreshing.")}
        </p>
      )}
    </section>
  );
}
