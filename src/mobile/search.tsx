import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Clock, Loader2, Play, Search, X } from "lucide-react";
import { topMovies, topSeries, type Meta } from "@/lib/cinemeta";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { isDirectVideoUrl, isMagnetInput } from "@/lib/torrent/magnet";
import { useView } from "@/lib/view";
import { animeHitMeta } from "@/components/search/anime-row";
import { MagnetCard } from "@/components/search/magnet-card";
import { PeopleRow } from "@/components/search/people-row";
import { UrlCard } from "@/components/search/url-card";
import { previewMeta } from "./meta-preview";
import "@/components/search/search-field.css";

/**
 * Search on a phone, as streaming apps do it rather than the Mac's floating
 * field: a full page with Back beside a compact field and the keyboard up.
 * Before typing it offers recent searches, what's trending and genres; from
 * the first letter, people and a poster grid. A title opens its quick look over
 * the results, so dismissing it lands back on them. The query, history and
 * sources are the desktop search's (SearchProvider).
 */
export function MobileSearch() {
  const { open, setOpen, query, setQuery, results, status, clear, recent, recordRecent, removeRecent, clearRecent } = useSearch();
  const t = useT();
  const { openFilter } = useView();
  const inputRef = useRef<HTMLInputElement>(null);
  const trending = useTrending(open);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const trimmed = query.trim();
  const close = () => {
    if (trimmed && results) recordRecent(query);
    setOpen(false);
  };
  const pick = (meta: Meta) => {
    if (trimmed) recordRecent(query);
    inputRef.current?.blur();
    previewMeta(meta);
  };
  const magnet = !!trimmed && isMagnetInput(trimmed);
  const directUrl = !!trimmed && !magnet && isDirectVideoUrl(trimmed);
  const titles = results && trimmed ? resultTitles(results) : [];
  const people = results && trimmed ? results.people : [];
  const searching = !!trimmed && (status === "typing" || status === "loading");
  const nothing = !!trimmed && !magnet && !directUrl && status === "done" && titles.length === 0 && people.length === 0;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("Search")} className="vayra-search fixed inset-0 z-[200] flex flex-col bg-canvas">
      <div className="shrink-0 pt-[var(--harbor-status-bar,1.75rem)]">
        <div className="flex h-16 items-center gap-1 ps-1 pe-4">
          <button
            type="button"
            onClick={close}
            aria-label={t("common.back")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors active:bg-elevated"
          >
            <ArrowLeft size={22} strokeWidth={2} className="dir-icon" />
          </button>
          <label data-search-field className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-raised ps-4 pe-1.5">
            <Search size={18} strokeWidth={2} className="shrink-0 text-ink-subtle" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                if (trimmed) recordRecent(query);
                inputRef.current?.blur();
              }}
              placeholder={t("Titles, people, genres")}
              aria-label={t("Search")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-subtle focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {searching && <Loader2 aria-hidden size={16} className="shrink-0 animate-spin text-ink-subtle" />}
            {query && (
              <button
                type="button"
                onClick={() => {
                  clear();
                  inputRef.current?.focus();
                }}
                aria-label={t("Clear")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-elevated active:text-ink"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            )}
          </label>
        </div>
      </div>

      <div className="min-h-0 grow basis-0 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+var(--vayra-safe-bottom))]">
        {!trimmed && (
          <div className="flex flex-col gap-8 pt-2">
            {recent.length > 0 && (
              <section className="flex flex-col gap-1">
                <SectionTitle
                  action={
                    <button type="button" onClick={clearRecent} className="text-[13px] font-medium text-ink-subtle active:text-ink">
                      {t("Clear history")}
                    </button>
                  }
                >
                  {t("Recent searches")}
                </SectionTitle>
                {recent.slice(0, 6).map((q) => (
                  <div key={q} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuery(q)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-start text-[15px] text-ink active:opacity-60"
                    >
                      <Clock size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" />
                      <span className="truncate">{q}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecent(q)}
                      aria-label={t("Remove {name}", { name: q })}
                      className="-me-2 flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle active:bg-elevated"
                    >
                      <X size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
              </section>
            )}
            <TrendingList items={trending} onPick={pick} />
            <section className="flex flex-col gap-3">
              <SectionTitle>{t("Try a genre")}</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {Object.entries(MOVIE_GENRES).map(([name, id]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openFilter({ kind: "genre", mediaType: "movie", name, id });
                    }}
                    className="h-9 rounded-full border border-edge px-4 text-[13.5px] font-medium text-ink transition-transform active:scale-95"
                  >
                    {t(name)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {magnet && (
          <div className="pt-2">
            <MagnetCard raw={trimmed} onClose={close} />
          </div>
        )}
        {directUrl && (
          <div className="pt-2">
            <UrlCard raw={trimmed} onClose={close} />
          </div>
        )}

        {trimmed && !magnet && !directUrl && (
          <div className="flex flex-col gap-7 pt-2">
            {status === "error" && titles.length === 0 && (
              <p role="alert" className="text-[14px] text-ink-muted">
                {t("Search could not be completed. Check your connection and try again.")}
              </p>
            )}
            {people.length > 0 && <PeopleRow people={people} onClose={close} />}
            {titles.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle>{t("Movies & shows")}</SectionTitle>
                <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                  {titles.map((m) => (
                    <PosterTile key={m.id} meta={m} onPick={pick} />
                  ))}
                </div>
              </section>
            )}
            {searching && titles.length === 0 && (
              <div aria-hidden className="grid grid-cols-3 gap-x-3 gap-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-elevated" />
                ))}
              </div>
            )}
            {nothing && (
              <div role="status" className="flex flex-col gap-8">
                <div className="flex flex-col gap-1.5 pt-4 text-center">
                  <span className="text-[16px] font-semibold text-ink">{t("No matches for \"{query}\"", { query: trimmed })}</span>
                  <span className="text-[13.5px] text-ink-muted">{t("Try another spelling, a person or a genre.")}</span>
                </div>
                <TrendingList items={trending} onPick={pick} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

type SearchResults = NonNullable<ReturnType<typeof useSearch>["results"]>;

/** Every title the search found, best match first, once each. */
export function resultTitles(results: SearchResults): Meta[] {
  const seen = new Set<string>();
  const out: Meta[] = [];
  const candidates = [results.topMatch?.meta, ...results.movies, ...results.series, ...results.anime.map(animeHitMeta)];
  for (const m of candidates) {
    if (!m || typeof m.id !== "string" || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

// What's trending, as streaming apps fill their search page before a query:
// Cinemeta's top movies and shows, alternated. Loaded on first open.
function useTrending(open: boolean): Meta[] {
  const [items, setItems] = useState<Meta[]>([]);
  const loaded = items.length > 0;
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    Promise.all([topMovies(), topSeries()])
      .then(([movies, series]) => {
        if (cancelled) return;
        const mixed: Meta[] = [];
        for (let i = 0; i < Math.max(movies.length, series.length); i++) {
          if (movies[i]) mixed.push(movies[i]);
          if (series[i]) mixed.push(series[i]);
        }
        setItems(mixed.filter((m) => m.background || m.poster).slice(0, 10));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);
  return items;
}

function TrendingList({ items, onPick }: { items: Meta[]; onPick: (meta: Meta) => void }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{t("Trending")}</SectionTitle>
      {items.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(m)}
          className="flex items-center gap-3 rounded-xl text-start transition-transform active:scale-[0.98]"
        >
          <span className="relative aspect-[16/9] w-32 shrink-0 overflow-hidden rounded-lg bg-elevated">
            {(m.background || m.poster) && (
              <img src={downscaleTmdb(m.background || m.poster)} alt="" decoding="async" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink" dir="auto">
            {m.name}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-ink">
            <Play size={14} fill="currentColor" className="ms-0.5" />
          </span>
        </button>
      ))}
    </section>
  );
}

function PosterTile({ meta, onPick }: { meta: Meta; onPick: (meta: Meta) => void }) {
  return (
    <button type="button" onClick={() => onPick(meta)} className="flex min-w-0 flex-col gap-1.5 text-start transition-transform active:scale-[0.97]">
      <span className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-elevated">
        {meta.poster ? (
          <img src={meta.poster} alt="" decoding="async" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center p-2 text-center text-[12px] font-medium text-ink-muted">{meta.name}</span>
        )}
      </span>
      <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink" dir="auto">
        {meta.name}
      </span>
    </button>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
      {action}
    </div>
  );
}

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w300/");
}
