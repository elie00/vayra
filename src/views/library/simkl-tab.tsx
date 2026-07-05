import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { getLocalCache, syncWatchlistCache, type SimklCacheItem, type SimklCache } from "@/lib/simkl/activities";
import { groupAnimeByFranchise, formatYearRange } from "@/lib/simkl/anime-grouping";
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
  // 5. Fallback: use simkl:{id} — ensures all items are visible even without external IDs
  if (!id) {
    id = `simkl:${simklId}`;
  }

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

  const [subTab, setSubTab] = useState<"movies" | "shows" | "anime">("movies");

  const allowedStatuses = useMemo(() => {
    if (subTab === "movies") {
      return ["plantowatch", "completed", "dropped"] as const;
    }
    return ["watching", "plantowatch", "completed", "hold", "dropped"] as const;
  }, [subTab]);

  const [statusFilter, setStatusFilter] = useState<string>("plantowatch");

  // Keep statusFilter aligned when changing sub-tabs
  useEffect(() => {
    if (!(allowedStatuses as readonly string[]).includes(statusFilter)) {
      setStatusFilter(allowedStatuses[0]);
    }
  }, [subTab, allowedStatuses, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!cache) return counts;

    if (subTab === "anime") {
      // For anime, count franchises per status (a franchise counts if ANY season has that status)
      const animeItems = Object.values(cache.items).filter((item) => item.type === "anime");
      const franchises = groupAnimeByFranchise(animeItems);
      for (const franchise of franchises) {
        const statuses = new Set(franchise.items.map((i) => i.status));
        for (const status of statuses) {
          // Only count if at least one item in the franchise has a valid meta
          const hasValidMeta = franchise.items.some((item) => cacheItemToMeta(item, cache));
          if (hasValidMeta) {
            counts[status] = (counts[status] ?? 0) + 1;
          }
        }
      }
      return counts;
    }

    const targetType = subTab === "movies" ? "movie" : "show";
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

    if (subTab === "anime") {
      // Group anime by franchise, then filter by status
      const animeItems = Object.values(cache.items).filter((item) => item.type === "anime");
      const franchises = groupAnimeByFranchise(animeItems);

      return franchises
        .filter((franchise) => {
          // A franchise shows up under a status if ANY of its seasons has that status
          return franchise.items.some((item) => item.status === statusFilter);
        })
        .map((franchise) => {
          // Use the first item that has a valid meta as the representative
          const representativeItem = franchise.items.find((item) => cacheItemToMeta(item, cache));
          if (!representativeItem) return null;
          const meta = cacheItemToMeta(representativeItem, cache);
          if (!meta) return null;

          // Override the title and year with franchise-level info
          meta.name = franchise.name;
          if (franchise.yearStart != null) {
            meta.releaseInfo = formatYearRange(franchise.yearStart, franchise.yearEnd);
          }

          // Use the latest watchedAt from any season in the franchise
          const dates = franchise.items
            .map((i) => i.watchedAt)
            .filter((d): d is string => d != null)
            .sort((a, b) => b.localeCompare(a));

          return {
            key: `simkl-franchise-${franchise.key}`,
            meta,
            date: dates.length > 0 ? parseTs(dates[0]) : null,
          };
        })
        .filter((x): x is WatchlistMerged => x !== null);
    }

    const targetType = subTab === "movies" ? "movie" : "show";
    return Object.values(cache.items)
      .filter((item) => {
        if (item.type !== targetType) return false;
        if (item.status !== statusFilter) return false;
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
  }, [cache, subTab, statusFilter]);

  const counts = useMemo(() => countByType(filteredItems), [filteredItems]);
  const visible = useMemo(() => applyFilter(filteredItems, type, query), [filteredItems, type, query]);

  return (
    <section className="flex flex-col gap-6">
      {/* Sub-tabs Selector */}
      <div className="flex gap-2 border-b border-edge-soft/60 pb-3">
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
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        {allowedStatuses.map((statusKey) => {
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
          hideTypePills={true}
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