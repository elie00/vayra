import { Bookmark, Search, X } from "lucide-react";
import { type Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { WatchlistCard } from "./watchlist-card";

export { WatchlistCard } from "./watchlist-card";
export { hydrateLibraryMeta, loadLocalIds } from "./hydrate-meta";

export type Tab = "watchlist" | "history" | "local" | "lists" | "trakt" | "anilist" | "simkl" | "letterboxd" | "mal";

export type TypeKey = "all" | "movie" | "series";

export type WatchlistMerged = { key: string; meta: Meta; date: number | null; stremioId?: string };

export function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-[background-color,color] duration-150 ${
        active
          ? "bg-ink text-canvas font-semibold shadow-sm"
          : "text-ink-muted hover:bg-elevated/75 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  type,
  setType,
  query,
  setQuery,
  counts,
  trailing,
  hideTypePills,
}: {
  type: TypeKey;
  setType: (t: TypeKey) => void;
  query: string;
  setQuery: (q: string) => void;
  counts: { all: number; movie: number; series: number };
  trailing?: React.ReactNode;
  hideTypePills?: boolean;
}) {
  const t = useT();
  return (
    <div className="vayra-surface flex flex-wrap items-center gap-2.5 p-2.5 sm:p-3">
      {!hideTypePills && (
        <div className="vayra-pill-track">
          <FilterPill active={type === "all"} onClick={() => setType("all")} count={counts.all}>
            {t("All")}
          </FilterPill>
          <FilterPill active={type === "movie"} onClick={() => setType("movie")} count={counts.movie}>
            {t("Movies")}
          </FilterPill>
          <FilterPill active={type === "series"} onClick={() => setType("series")} count={counts.series}>
            {t("Shows")}
          </FilterPill>
        </div>
      )}
      <div className="flex h-10 min-w-[200px] max-w-md flex-1 items-center gap-2 rounded-xl border border-edge-soft/75 bg-canvas/75 px-3 text-ink-subtle transition-colors focus-within:border-edge">
        <Search size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search title…")}
          aria-label={t("Search title…")}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-subtle outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("Clear")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {trailing}
    </div>
  );
}

export function FilterPill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-[background-color,color] duration-150 ${
        active
          ? "bg-ink text-canvas font-semibold"
          : "text-ink-muted hover:bg-elevated/80 hover:text-ink"
      }`}
    >
      <span>{children}</span>
      {count != null && (
        <span className={`text-[11px] tabular-nums ${active ? "text-canvas/70" : "text-ink-subtle"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function applyFilter<T extends { meta: Meta }>(items: T[], type: TypeKey, query: string): T[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (type !== "all" && it.meta.type !== type) return false;
    if (q && !(it.meta.name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countByType<T extends { meta: Meta }>(items: T[]) {
  return {
    all: items.length,
    movie: items.filter((i) => i.meta.type === "movie").length,
    series: items.filter((i) => i.meta.type === "series").length,
  };
}

export function bucketFor(ms: number | null, nowMs: number): { rank: number; label: string } {
  if (ms == null) return { rank: 1000, label: "No date" };
  const days = (nowMs - ms) / 86400_000;
  if (days < 1) return { rank: 0, label: "Today" };
  if (days < 7) return { rank: 1, label: "This week" };
  if (days < 30) return { rank: 2, label: "This month" };
  const year = new Date(ms).getFullYear();
  const thisYear = new Date(nowMs).getFullYear();
  return { rank: 10 + (thisYear - year), label: String(year) };
}

export function groupByDate<T extends { date: number | null }>(
  entries: T[],
): Array<{ label: string; items: T[] }> {
  const now = Date.now();
  const sorted = [...entries].sort((a, b) => (b.date ?? -Infinity) - (a.date ?? -Infinity));
  const groups = new Map<string, { rank: number; label: string; items: T[] }>();
  for (const e of sorted) {
    const b = bucketFor(e.date, now);
    let g = groups.get(b.label);
    if (!g) {
      g = { rank: b.rank, label: b.label, items: [] };
      groups.set(b.label, g);
    }
    g.items.push(e);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank);
}

export type SortKey = "recent" | "title" | "year";

function releaseYear(m: Meta): number {
  return parseInt((m.releaseInfo ?? "").slice(0, 4), 10) || 0;
}

export function sortedGroups<T extends { meta: Meta; date: number | null }>(
  entries: T[],
  sort: SortKey,
): Array<{ label: string; items: T[] }> {
  if (sort === "title") {
    const items = [...entries].sort((a, b) =>
      (a.meta.name ?? "").localeCompare(b.meta.name ?? "", undefined, { sensitivity: "base" }),
    );
    return [{ label: "A to Z", items }];
  }
  if (sort === "year") {
    const items = [...entries].sort((a, b) => releaseYear(b.meta) - releaseYear(a.meta));
    return [{ label: "By year", items }];
  }
  return groupByDate(entries);
}

export function SortControl() {
  const t = useT();
  const { settings, update } = useSettings();
  const options: Array<[SortKey, string]> = [
    ["recent", t("Recent")],
    ["title", t("A-Z")],
    ["year", t("Year")],
  ];
  return (
    <div className="vayra-pill-track">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={settings.librarySort === key}
          onClick={() => update({ librarySort: key })}
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ${
            settings.librarySort === key
              ? "bg-ink text-canvas font-semibold"
              : "text-ink-muted hover:bg-elevated/80 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GroupedGrid<
  T extends { meta: Meta; date: number | null; key: string; stremioId?: string },
>({
  groups,
  onRemove,
}: {
  groups: Array<{ label: string; items: T[] }>;
  onRemove?: (stremioId: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <h3 className="vayra-kicker shrink-0">
              {t(g.label)}
            </h3>
            <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-ink-subtle">
              {g.items.length}
            </span>
            <div className="vayra-header-rule flex-1" aria-hidden="true" />
          </div>
          <Grid>
            {g.items.map((it) => (
              <WatchlistCard
                key={it.key}
                meta={it.meta}
                onRemove={onRemove && it.stremioId ? () => onRemove(it.stremioId as string) : undefined}
              />
            ))}
          </Grid>
        </div>
      ))}
    </div>
  );
}

export function EmptyWatchlist({ connected }: { connected: boolean }) {
  const t = useT();
  const { setView } = useView();
  return (
    <div className="vayra-surface flex flex-col items-center gap-4 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-edge-soft/75 bg-elevated/80 text-ink-subtle">
        <Bookmark size={24} strokeWidth={1.7} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.015em] text-ink">
          {t("Your watchlist is empty")}
        </h2>
        <p className="max-w-md text-[13.5px] leading-relaxed text-ink-muted">
          {t("Right-click any title in VAYRA or hit \"Add to Watchlist\" on its detail page to save it here.")}
          {connected
            ? t(" Anything you save also syncs to your Trakt account.")
            : t(" Connect Trakt in Settings to sync this list across devices.")}
        </p>
      </div>
      <button type="button" className="mac-primary-button mt-1" onClick={() => setView("discover")}>
        {t("Explore")}
      </button>
    </div>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const base = Math.round(150 * settings.posterScale);
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${base}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function parseTs(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isNaN(n) ? null : n;
}
