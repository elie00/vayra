import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { getLocalCache, syncWatchlistCache, type SimklCacheItem, type SimklCache } from "@/lib/simkl/activities";
import type { Meta } from "@/lib/cinemeta";
import {
  FilterBar,
  GroupedGrid,
  parseTs,
  SortControl,
  sortedGroups,
  type TypeKey,
  type WatchlistMerged,
  countByType,
  applyFilter,
} from "./shared";

const STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  plantowatch: "Plan to Watch",
  completed: "Completed",
  hold: "On Hold",
  dropped: "Dropped",
};

function isStatusEnabled(
  subTab: "movies" | "shows" | "anime",
  status: string,
  filters: any
): boolean {
  const group = filters[subTab];
  if (!group) return false;
  return !!group[status];
}

function cacheItemToMeta(item: SimklCacheItem, cache: SimklCache): Meta | null {
  let id: string | null = null;
  const simklId = item.simklId;

  // 1. Search imdbToSimkl mapping
  const imdbId = Object.keys(cache.imdbToSimkl).find((k) => cache.imdbToSimkl[k] === simklId);
  if (imdbId) {
    id = imdbId;
  } else {
    // 2. Search tmdbToSimkl mapping
    const tmdbKey = Object.keys(cache.tmdbToSimkl).find((k) => cache.tmdbToSimkl[k] === simklId);
    if (tmdbKey) {
      const parts = tmdbKey.split(":");
      if (parts.length === 2) {
        id = `tmdb:${parts[0]}:${parts[1]}`;
      }
    }
  }

  // 3. Search malToSimkl mapping
  if (!id) {
    const malId = Object.keys(cache.malToSimkl).find((k) => cache.malToSimkl[k] === simklId);
    if (malId) id = `mal:${malId}`;
  }
  // 4. Search kitsuToSimkl mapping
  if (!id) {
    const kitsuId = Object.keys(cache.kitsuToSimkl).find((k) => cache.kitsuToSimkl[k] === simklId);
    if (kitsuId) id = `kitsu:${kitsuId}`;
  }

  if (!id) return null;

  return {
    id,
    type: item.type === "movie" ? "movie" : "series",
    name: item.title || "Unknown Title",
    releaseInfo: item.year ? String(item.year) : undefined,
  };
}

export function SimklTab() {
  const tr = useT();
  const { settings } = useSettings();
  const [cache, setCache] = useState<SimklCache | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    
    const initial = getLocalCache();
    if (initial) {
      setCache(initial);
      setStatus("ready");
    } else {
      setStatus("loading");
    }

    syncWatchlistCache()
      .then((updated) => {
        if (cancelled) return;
        setCache(updated);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled && !initial) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isMoviesVisible = Object.values(settings.simklGranularFilters.movies).some((v) => v);
  const isShowsVisible = Object.values(settings.simklGranularFilters.shows).some((v) => v);
  const isAnimeVisible = Object.values(settings.simklGranularFilters.anime).some((v) => v);

  const initialSubTab = useMemo(() => {
    if (isMoviesVisible) return "movies";
    if (isShowsVisible) return "shows";
    if (isAnimeVisible) return "anime";
    return "movies";
  }, [isMoviesVisible, isShowsVisible, isAnimeVisible]);

  const [subTab, setSubTab] = useState<"movies" | "shows" | "anime">("movies");

  // Keep subTab updated if the active one gets hidden
  useEffect(() => {
    const isCurrentVisible =
      subTab === "movies" ? isMoviesVisible : subTab === "shows" ? isShowsVisible : isAnimeVisible;
    if (!isCurrentVisible) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab, subTab, isMoviesVisible, isShowsVisible, isAnimeVisible]);

  const allowedStatuses = useMemo(() => {
    if (subTab === "movies") {
      return ["plantowatch", "completed", "dropped"] as const;
    }
    return ["watching", "plantowatch", "completed", "hold", "dropped"] as const;
  }, [subTab]);

  const [statusFilter, setStatusFilter] = useState<string>("plantowatch");

  // Keep statusFilter aligned when changing sub-tabs or filters
  useEffect(() => {
    const isCurrentAllowedAndEnabled =
      (allowedStatuses as readonly string[]).includes(statusFilter) &&
      isStatusEnabled(subTab, statusFilter, settings.simklGranularFilters);

    if (!isCurrentAllowedAndEnabled) {
      const firstActive = allowedStatuses.find((s) =>
        isStatusEnabled(subTab, s, settings.simklGranularFilters)
      );
      if (firstActive) {
        setStatusFilter(firstActive);
      }
    }
  }, [subTab, settings.simklGranularFilters, allowedStatuses, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!cache) return counts;

    const targetType = subTab === "movies" ? "movie" : subTab === "shows" ? "show" : "anime";
    for (const item of Object.values(cache.items)) {
      if (item.type !== targetType) continue;
      const meta = cacheItemToMeta(item, cache);
      if (!meta) continue;

      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [cache, subTab]);

  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");

  const filteredItems = useMemo<WatchlistMerged[]>(() => {
    if (!cache) return [];
    const targetType = subTab === "movies" ? "movie" : subTab === "shows" ? "show" : "anime";

    return Object.values(cache.items)
      .filter((item) => {
        if (item.type !== targetType) return false;
        if (item.status !== statusFilter) return false;

        const isEnabled = isStatusEnabled(subTab, item.status, settings.simklGranularFilters);
        if (!isEnabled) return false;
        return true;
      })
      .map((item) => {
        const meta = cacheItemToMeta(item, cache);
        if (!meta) return null;
        return {
          key: `simkl-${item.simklId}`,
          meta,
          date: item.watchedAt ? parseTs(item.watchedAt) : null,
        };
      })
      .filter((x): x is WatchlistMerged => x !== null);
  }, [cache, subTab, statusFilter, settings.simklGranularFilters]);

  const counts = useMemo(() => countByType(filteredItems), [filteredItems]);
  const visible = useMemo(() => applyFilter(filteredItems, type, query), [filteredItems, type, query]);

  const allDisabled = !isMoviesVisible && !isShowsVisible && !isAnimeVisible;

  if (allDisabled) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
        <h2 className="text-[16px] font-semibold text-ink">{tr("All SIMKL sync filters are disabled")}</h2>
        <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
          {tr("Enable at least one watchlist status toggle in Settings to view your SIMKL library here.")}
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Sub-tabs Selector */}
      <div className="flex gap-2 border-b border-edge-soft/60 pb-3">
        {isMoviesVisible && (
          <button
            type="button"
            onClick={() => setSubTab("movies")}
            className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-all ${
              subTab === "movies"
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-ink-muted hover:text-ink border border-transparent hover:bg-canvas/50"
            }`}
          >
            {tr("Movies")}
          </button>
        )}
        {isShowsVisible && (
          <button
            type="button"
            onClick={() => setSubTab("shows")}
            className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-all ${
              subTab === "shows"
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-ink-muted hover:text-ink border border-transparent hover:bg-canvas/50"
            }`}
          >
            {tr("TV Shows")}
          </button>
        )}
        {isAnimeVisible && (
          <button
            type="button"
            onClick={() => setSubTab("anime")}
            className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-all ${
              subTab === "anime"
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-ink-muted hover:text-ink border border-transparent hover:bg-canvas/50"
            }`}
          >
            {tr("Anime")}
          </button>
        )}
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        {allowedStatuses.map((statusKey) => {
          const isEnabled = isStatusEnabled(subTab, statusKey, settings.simklGranularFilters);
          if (!isEnabled) return null;

          const count = statusCounts[statusKey] ?? 0;
          const isActive = statusFilter === statusKey;

          return (
            <button
              key={statusKey}
              type="button"
              onClick={() => setStatusFilter(statusKey)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-ink text-canvas font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                  : "bg-canvas/50 border border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
              }`}
            >
              {tr(STATUS_LABELS[statusKey])}
              <span className="ms-1.5 text-[11px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search and Filters */}
      {filteredItems.length > 0 && (
        <FilterBar
          type={type}
          setType={setType}
          query={query}
          setQuery={setQuery}
          counts={counts}
          trailing={<SortControl />}
        />
      )}

      {status === "loading" && <p className="text-[13px] text-ink-muted">{tr("Loading…")}</p>}
      {status === "error" && (
        <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12px] text-danger ring-1 ring-danger/30">
          {tr("Couldn't reach Simkl. Try refreshing.")}
        </p>
      )}

      {status === "ready" && visible.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          {filteredItems.length === 0
            ? tr("No items found in this section.")
            : tr("No matches for these filters.")}
        </p>
      )}

      {visible.length > 0 && (
        <GroupedGrid groups={sortedGroups(visible, settings.librarySort)} />
      )}
    </section>
  );
}
