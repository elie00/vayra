import { Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { library, libraryMetaType, removeStremioLibraryItem, type LibraryItem } from "@/lib/stremio";
import { fetchWatchedHistory, type HistoryItem } from "@/lib/trakt/history";
import { useTrakt } from "@/lib/trakt/provider";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  applyFilter,
  countByType,
  FilterBar,
  groupByDate,
  GroupedGrid,
  parseTs,
  SortControl,
  sortedGroups,
  type TypeKey,
  type WatchlistMerged,
} from "./shared";

export function HistoryTab() {
  const t = useT();
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const [stremio, setStremio] = useState<LibraryItem[]>([]);
  const [trakt, setTrakt] = useState<HistoryItem[]>([]);
  const [traktStatus, setTraktStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!authKey) {
      setStremio([]);
      return;
    }
    let cancelled = false;
    library(authKey)
      .then((items) => {
        if (cancelled) return;
        setStremio(filterHistory(items));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const handleRemove = useCallback(
    async (stremioId: string) => {
      if (!authKey) return;
      setStremio((prev) => prev.filter((i) => i._id !== stremioId));
      try {
        await removeStremioLibraryItem(authKey, stremioId);
      } catch {
        library(authKey)
          .then((items) => setStremio(filterHistory(items)))
          .catch(() => {});
      }
    },
    [authKey],
  );

  useEffect(() => {
    if (!traktConnected) {
      setTrakt([]);
      setTraktStatus("idle");
      return;
    }
    let cancelled = false;
    setTraktStatus("loading");
    fetchWatchedHistory(200)
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

  const merged = useMemo(() => mergeHistory(stremio, trakt), [stremio, trakt]);
  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");
  const [flat, setFlat] = useState(() => localStorage.getItem("harbor.history.flat") === "1");
  const toggleFlat = useCallback(() => {
    setFlat((v) => {
      const next = !v;
      try {
        localStorage.setItem("harbor.history.flat", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const counts = useMemo(() => countByType(merged), [merged]);
  const visible = useMemo(() => applyFilter(merged, type, query), [merged, type, query]);

  if (!authKey && !traktConnected) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
        <Clock size={28} strokeWidth={1.6} className="text-ink-subtle" />
        <h2 className="text-[16px] font-semibold text-ink">{t("No history yet")}</h2>
        <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
          {t("Sign in to Stremio or connect Trakt to see what you've been watching here.")}
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {merged.length > 0 && (
        <FilterBar
          type={type}
          setType={setType}
          query={query}
          setQuery={setQuery}
          counts={counts}
          trailing={
            <>
              <SortControl />
              {settings.librarySort === "recent" && (
                <ViewModeToggle flat={flat} onToggle={toggleFlat} />
              )}
            </>
          }
        />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-muted">
          {merged.length === 1
            ? t("{n} item", { n: merged.length })
            : t("{n} items", { n: merged.length })}
          {traktConnected && traktStatus === "loading" ? t(" · Syncing Trakt…") : ""}
        </span>
      </div>
      {merged.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
          <Clock size={28} strokeWidth={1.6} className="text-ink-subtle" />
          <h2 className="text-[16px] font-semibold text-ink">{t("Nothing watched yet")}</h2>
          <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
            {t("Press play on something. It'll show up here once you start watching.")}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-6 py-10 text-center text-[13px] text-ink-muted">
          {t("No matches for these filters.")}
        </p>
      ) : settings.librarySort !== "recent" ? (
        <GroupedGrid groups={sortedGroups(visible, settings.librarySort)} onRemove={handleRemove} />
      ) : flat ? (
        <GroupedGrid
          groups={[{ label: "Everything", items: [...visible].sort((a, b) => (b.date ?? -Infinity) - (a.date ?? -Infinity)) }]}
          onRemove={handleRemove}
        />
      ) : (
        <GroupedGrid groups={groupByDate(visible)} onRemove={handleRemove} />
      )}
    </section>
  );
}

function ViewModeToggle({ flat, onToggle }: { flat: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 rounded-full bg-elevated/40 p-0.5 ring-1 ring-edge-soft/60">
      <button
        onClick={() => flat && onToggle()}
        className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
          !flat ? "bg-ink text-canvas" : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        {t("Grouped")}
      </button>
      <button
        onClick={() => !flat && onToggle()}
        className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
          flat ? "bg-ink text-canvas" : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        {t("One list")}
      </button>
    </div>
  );
}

function filterHistory(items: LibraryItem[]): LibraryItem[] {
  return items
    .filter((i) => !i.removed || i.temp)
    .filter((i) => i.state?.flaggedWatched === 1 || (i.state?.timeOffset ?? 0) > 0)
    .sort(
      (a, b) =>
        Date.parse(b.state?.lastWatched ?? b._mtime) -
        Date.parse(a.state?.lastWatched ?? a._mtime),
    );
}

function mergeHistory(stremio: LibraryItem[], trakt: HistoryItem[]): WatchlistMerged[] {
  const out = new Map<string, WatchlistMerged>();
  for (const item of stremio) {
    out.set(item._id, {
      key: item._id,
      meta: {
        id: item._id,
        type: libraryMetaType(item.type),
        name: item.name,
        poster: item.poster,
        background: item.background,
      },
      date: parseTs(item._mtime),
      stremioId: item._id,
    });
  }
  for (const h of trakt) {
    const id = h.type === "movie" ? h.imdb : h.showImdb;
    if (!id || out.has(id)) continue;
    out.set(id, {
      key: id,
      meta: {
        id,
        type: h.type === "movie" ? "movie" : "series",
        name: h.type === "movie" ? h.title : (h.showImdb ? "" : h.title),
      },
      date: parseTs(h.watchedAt),
    });
  }
  return Array.from(out.values());
}

export function historyItemsToDated(items: HistoryItem[]): WatchlistMerged[] {
  const seen = new Set<string>();
  const out: WatchlistMerged[] = [];
  for (const h of items) {
    const id = h.type === "movie" ? h.imdb : h.showImdb;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      key: id,
      meta: {
        id,
        type: h.type === "movie" ? "movie" : "series",
        name: h.title,
      },
      date: parseTs(h.watchedAt),
    });
  }
  return out;
}
