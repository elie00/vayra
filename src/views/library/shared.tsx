import { Bookmark, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Poster } from "@/components/poster";
import { narrowMediaType, type Meta } from "@/lib/cinemeta";
import { resolveMeta } from "@/lib/meta-resource";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useInWatchlist } from "@/lib/watchlist";
import { useT } from "@/lib/i18n";

export type Tab = "watchlist" | "history" | "local" | "trakt" | "anilist" | "simkl";

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
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-4 pb-3 pt-2 text-[13.5px] font-semibold transition-colors ${
        active ? "text-ink" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? "bg-ink" : "bg-transparent"
        }`}
      />
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
}: {
  type: TypeKey;
  setType: (t: TypeKey) => void;
  query: string;
  setQuery: (q: string) => void;
  counts: { all: number; movie: number; series: number };
  trailing?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-full bg-elevated/40 p-0.5 ring-1 ring-edge-soft/60">
        <FilterPill active={type === "all"} onClick={() => setType("all")}>
          {t("All")} <span className="ms-1 text-ink-subtle">{counts.all}</span>
        </FilterPill>
        <FilterPill active={type === "movie"} onClick={() => setType("movie")}>
          {t("Movies")} <span className="ms-1 text-ink-subtle">{counts.movie}</span>
        </FilterPill>
        <FilterPill active={type === "series"} onClick={() => setType("series")}>
          {t("Shows")} <span className="ms-1 text-ink-subtle">{counts.series}</span>
        </FilterPill>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Search title…")}
        className="min-w-[220px] flex-1 max-w-md rounded-full bg-elevated/40 px-4 py-2 text-[13px] text-ink placeholder:text-ink-subtle ring-1 ring-edge-soft/60 outline-none focus:ring-edge"
      />
      {trailing}
    </div>
  );
}

export function FilterPill({
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
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active
          ? "bg-ink text-canvas"
          : "text-ink-muted hover:bg-raised hover:text-ink"
      }`}
    >
      {children}
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
    <div className="flex items-center gap-1 rounded-full bg-elevated/40 p-0.5 ring-1 ring-edge-soft/60">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => update({ librarySort: key })}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            settings.librarySort === key
              ? "bg-ink text-canvas"
              : "text-ink-muted hover:bg-raised hover:text-ink"
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
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-ink-subtle">
            {t(g.label)} <span className="ms-1 text-ink-subtle/70">{g.items.length}</span>
          </h3>
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

const metaHydrateCache = new Map<string, Promise<Meta | null>>();

export async function hydrateLibraryMeta(
  id: string,
  type: "movie" | "series",
  tmdbKey: string | null,
): Promise<Meta | null> {
  const cacheKey = `${type}:${id}`;
  const cached = metaHydrateCache.get(cacheKey);
  if (cached) return cached;
  const authKey = (() => {
    try {
      const raw = localStorage.getItem("harbor.auth");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { authKey?: string };
      return parsed.authKey ?? null;
    } catch {
      return null;
    }
  })();
  const p = (async () => {
    if (id.startsWith("tmdb:") && tmdbKey) {
      const isTv = id.startsWith("tmdb:tv:") || id.startsWith("tmdb:series:");
      const tmdbType = isTv ? "tv" : "movie";
      const tmdbId = id.replace(/^tmdb:(movie|tv|series):/, "");
      try {
        const r = await fetch(
          `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${tmdbKey}`,
        );
        if (r.ok) {
          const j = await r.json();
          return {
            id,
            type,
            name: j.title || j.name || "",
            poster: j.poster_path ? `https://image.tmdb.org/t/p/w342${j.poster_path}` : undefined,
            background: j.backdrop_path
              ? `https://image.tmdb.org/t/p/w780${j.backdrop_path}`
              : undefined,
            releaseInfo: (j.release_date || j.first_air_date)?.slice(0, 4),
          } as Meta;
        }
      } catch {
        /* fall through to addon resolve */
      }
    }
    return (await resolveMeta(authKey, type, id).catch(() => null)) ?? null;
  })();
  metaHydrateCache.set(cacheKey, p);
  return p;
}

export function loadLocalIds(): Set<string> {
  try {
    const raw = localStorage.getItem("harbor.watchlist.v1");
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    const ids = arr
      .map((el) =>
        typeof el === "string"
          ? el
          : el && typeof el === "object" && typeof (el as { id?: unknown }).id === "string"
            ? (el as { id: string }).id
            : null,
      )
      .filter((v): v is string => typeof v === "string");
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function WatchlistCard({ meta, onRemove }: { meta: Meta; onRemove?: () => void }) {
  const t = useT();
  const { openMeta } = useView();
  const { settings } = useSettings();
  const inList = useInWatchlist(meta.id);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState<Meta | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const posterFailedOnceRef = useRef(false);
  useEffect(() => {
    posterFailedOnceRef.current = false;
    setPosterFailed(false);
  }, [meta.id]);
  const onPosterError = useCallback(() => {
    if (posterFailedOnceRef.current) return;
    posterFailedOnceRef.current = true;
    setPosterFailed(true);
  }, []);
  useEffect(() => {
    if (meta.poster && meta.name && !posterFailed) {
      setHydrated(null);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    let cancelled = false;
    const run = () => {
      hydrateLibraryMeta(meta.id, narrowMediaType(meta.type), settings.tmdbKey ?? null)
        .then((full) => {
          if (cancelled || !full) return;
          setHydrated(full);
        })
        .catch(() => {});
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [meta.id, meta.type, meta.poster, meta.name, settings.tmdbKey, posterFailed]);
  const display: Meta = hydrated ? { ...meta, ...hydrated, id: meta.id, type: meta.type } : meta;
  const open = () => openMeta(display);
  return (
    <div
      ref={cardRef}
      className="group relative flex flex-col gap-2 text-start"
      onMouseLeave={() => setConfirm(false)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] outline-none ring-offset-2 ring-offset-canvas transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-ink group-hover:scale-[1.02]"
      >
        <Poster
          src={display.poster}
          seed={display.id}
          className="h-full w-full"
          onError={onPosterError}
        />
        {inList && (
          <span className="absolute start-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-canvas backdrop-blur-sm">
            <Bookmark size={12} strokeWidth={2.6} fill="currentColor" />
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm) {
                onRemove();
                setConfirm(false);
              } else {
                setConfirm(true);
              }
            }}
            className={`absolute end-2 top-2 flex h-7 items-center justify-center gap-1 rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 ${
              confirm
                ? "bg-danger px-2.5 text-[11px] font-semibold"
                : "w-7 bg-canvas/70 opacity-0 backdrop-blur-sm hover:bg-canvas/90 group-hover:opacity-100"
            }`}
            aria-label={confirm ? t("Confirm remove from library") : t("Remove from library")}
          >
            <Trash2 size={12} strokeWidth={2.2} />
            {confirm && t("Remove")}
          </button>
        )}
      </div>
      <button type="button" onClick={open} className="text-start">
        <p className="truncate text-[13px] font-medium text-ink transition-colors hover:text-accent">
          {display.name || meta.id}
        </p>
        {display.releaseInfo && (
          <p className="-mt-1.5 truncate text-[11.5px] text-ink-subtle">{display.releaseInfo}</p>
        )}
      </button>
    </div>
  );
}

export function EmptyWatchlist({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
      <Bookmark size={28} strokeWidth={1.6} className="text-ink-subtle" />
      <h2 className="text-[16px] font-semibold text-ink">{t("Your watchlist is empty")}</h2>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
        {t("Right-click any title in Harbor or hit \"Add to Watchlist\" on its detail page to save it here.")}
        {connected
          ? t(" Anything you save also syncs to your Trakt account.")
          : t(" Connect Trakt in Settings to sync this list across devices.")}
      </p>
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
