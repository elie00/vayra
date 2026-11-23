import { useCallback, useMemo, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  applyFilter,
  countByType,
  EmptyWatchlist,
  FilterBar,
  GroupedGrid,
  groupByDate,
  SortControl,
  sortedGroups,
  type TypeKey,
} from "./shared";
import { useWatchlistData } from "./use-watchlist-data";

export function WatchlistTab() {
  const tr = useT();
  const { settings } = useSettings();
  const { merged, handleRemove, authKey, trakt, traktConnected, traktStatus, localEntries, rawCount } = useWatchlistData();

  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");
  const [flat, setFlat] = useState(() => localStorage.getItem("harbor.watchlist.flat") === "1");
  const toggleFlat = useCallback(() => {
    setFlat((v) => {
      const next = !v;
      try {
        localStorage.setItem("harbor.watchlist.flat", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const counts = useMemo(() => countByType(merged), [merged]);
  const visible = useMemo(() => applyFilter(merged, type, query), [merged, type, query]);

  const subtitle = (() => {
    const parts: string[] = [];
    if (traktConnected)
      parts.push(
        traktStatus === "loading" ? tr("Syncing Trakt…") : tr("{n} on Trakt", { n: trakt.length }),
      );
    else parts.push(tr("Connect Trakt in Settings to sync"));
    parts.push(tr("{n} saved on this device", { n: localEntries.length }));
    if (authKey && rawCount > 0) parts.push(tr("{n} in your Stremio library", { n: rawCount }));
    return parts.join(" · ");
  })();

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
        <span className="text-[12px] text-ink-muted">{subtitle}</span>
      </div>
      {merged.length === 0 ? (
        <EmptyWatchlist connected={traktConnected} />
      ) : visible.length === 0 ? (
        <div className="vayra-surface flex flex-col items-center gap-3.5 px-6 py-12 text-center">
          <p className="text-[14px] text-ink-muted">{tr("No matches for these filters.")}</p>
          <button
            type="button"
            className="mac-secondary-button"
            onClick={() => {
              setType("all");
              setQuery("");
            }}
          >
            {tr("Clear filters")}
          </button>
        </div>
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
    <div className="vayra-pill-track">
      <button
        type="button"
        aria-pressed={!flat}
        onClick={() => flat && onToggle()}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ${
          !flat ? "bg-ink text-canvas font-semibold" : "text-ink-muted hover:bg-elevated/80 hover:text-ink"
        }`}
      >
        {t("Grouped")}
      </button>
      <button
        type="button"
        aria-pressed={flat}
        onClick={() => !flat && onToggle()}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ${
          flat ? "bg-ink text-canvas font-semibold" : "text-ink-muted hover:bg-elevated/80 hover:text-ink"
        }`}
      >
        {t("One list")}
      </button>
    </div>
  );
}
