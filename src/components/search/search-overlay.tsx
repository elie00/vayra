import { Search, X, Loader2, CornerDownLeft, CalendarRange, Tag } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { emptySearchOutcome, useSearch } from "@/lib/search-context";
import { useView } from "@/lib/view";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/feed/tags";
import { AnimeRow } from "./anime-row";
import { EmptyState } from "./empty-state";
import { LiveTvRow } from "./live-tv-row";
import { TopMatch } from "./top-match";
import { PeopleRow } from "./people-row";
import { MetaList } from "./meta-list";
import { AddonHits } from "./addon-hits";
import { AddonResults } from "./addon-results";
import { WebSearchButton } from "./web-search-button";
import { searchInputKind } from "@/lib/search-input";
import { useFocusTrap } from "@/lib/use-focus-trap";
import "./search-field.css";

const GuideModal = lazy(() =>
  import("./guide-modal").then((m) => ({ default: m.GuideModal })),
);
const MagnetCard = lazy(() =>
  import("./magnet-card").then((m) => ({ default: m.MagnetCard })),
);
const UrlCard = lazy(() =>
  import("./url-card").then((m) => ({ default: m.UrlCard })),
);
const AiSearchSection = lazy(() =>
  import("./ai-search-section").then((m) => ({ default: m.AiSearchSection })),
);

export function SearchOverlay() {
  const { open, setOpen, query, setQuery, results, status, sources, clear, retry, recordRecent } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, open);
  const { openFilter, openMeta } = useView();
  const t = useT();
  const [guideOpen, setGuideOpen] = useState(false);
  const [aiRunSignal, setAiRunSignal] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (query.trim() && results) recordRecent(query);
    setOpen(false);
  };

  const onIntent = () => {
    const intent = results?.intent;
    if (!intent) return;
    if (intent.kind === "genre") {
      const id = (intent.mediaType === "movie" ? MOVIE_GENRES : TV_GENRES)[intent.genre];
      if (typeof id === "number") {
        recordRecent(query);
        openFilter({ kind: "genre", mediaType: intent.mediaType, name: intent.genre, id });
        setOpen(false);
      }
      return;
    }
    if (intent.kind === "year") {
      recordRecent(query);
      openFilter({ kind: "year", mediaType: "movie", value: intent.year });
      setOpen(false);
    }
  };

  const trimmed = query.trim();
  const inputKind = searchInputKind(trimmed);
  const directInput = inputKind !== "text";
  const hasResults = Boolean(
    results &&
    trimmed &&
    (results.topMatch ||
      results.people.length ||
      results.movies.length ||
      results.series.length ||
      results.liveTv.length ||
      results.anime.length ||
      results.addons.length ||
      results.addonGroups.length));
  const noResults =
    results &&
    trimmed &&
    emptySearchOutcome(status, sources) === "no-match" &&
    !results.topMatch &&
    results.people.length === 0 &&
    results.movies.length === 0 &&
    results.series.length === 0 &&
    results.liveTv.length === 0 &&
    results.anime.length === 0 &&
    results.addons.length === 0 &&
    results.addonGroups.length === 0;

  const moveResultFocus = (dir: 1 | -1) => {
    const container = resultsRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter(
      (b) => b.offsetParent !== null,
    );
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) {
      (dir === 1 ? buttons[0] : buttons[buttons.length - 1]).focus();
      return;
    }
    const next = idx + dir;
    if (next < 0) {
      inputRef.current?.focus();
    } else if (next < buttons.length) {
      buttons[next].focus();
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("Search")}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveResultFocus(1);
        } else if (e.key === "ArrowUp" && document.activeElement !== inputRef.current) {
          e.preventDefault();
          moveResultFocus(-1);
        }
      }}
      className="fixed inset-0 z-[200] flex flex-col"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Close search")}
        onClick={close}
        className="harbor-search-backdrop absolute inset-0 cursor-default"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[1040px] flex-col px-6 py-6 sm:px-10 sm:py-9">
        <div
          data-search-field=""
          className="modal-panel flex shrink-0 items-center gap-3.5 rounded-2xl border border-edge-soft/85 bg-surface/92 px-5 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85),0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur-2xl"
        >
          <Search size={20} className="shrink-0 text-ink-muted" strokeWidth={1.9} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // IME confirmation, held keys and system shortcuts must not open
              // a title or trigger an AI request while the user is still typing.
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
              if (directInput) return;
              // Shift+Enter runs the AI search on what is typed, without having
              // to reach for the button below the results.
              if (e.key === "Enter" && e.shiftKey) {
                if (!query.trim()) return;
                e.preventDefault();
                setAiRunSignal((n) => n + 1);
                return;
              }
              if (e.key === "Enter" && results?.query.trim() === query.trim()) {
                if (results.topMatch) {
                  e.preventDefault();
                  recordRecent(query);
                  const meta = results.topMatch.meta;
                  setOpen(false);
                  openMeta(meta);
                } else if (results.intent) {
                  e.preventDefault();
                  onIntent();
                }
              }
            }}
            placeholder={t("Search movies, shows, people, genres, years...")}
            aria-label={t("Search movies, shows, people, genres, years...")}
            className="h-16 min-w-0 flex-1 bg-transparent text-[18px] tracking-[-0.01em] text-ink placeholder:text-ink-subtle focus:outline-none sm:text-[20px]"
            spellCheck={false}
            autoComplete="off"
          />
          {status === "loading" && <Loader2 aria-hidden="true" size={17} className="shrink-0 animate-spin text-ink-subtle" />}
          {!directInput && <WebSearchButton />}
          {query && (
            <button
              type="button"
              aria-label={t("Clear")}
              onClick={() => {
                clear();
                inputRef.current?.focus();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
            >
              <X size={17} strokeWidth={2.1} />
            </button>
          )}
          <Hint showNav={hasResults} />
        </div>

        <div ref={resultsRef} className="relative mt-6 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!trimmed && <EmptyState onClose={close} onOpenGuide={() => setGuideOpen(true)} />}

          {trimmed && !directInput && status === "error" && (
            <div className="vayra-surface mb-6 flex flex-wrap items-center gap-3 p-4">
              <p role="alert" className="min-w-0 flex-1 text-[13.5px] text-ink-muted">
                {t(hasResults
                  ? "Some search sources are unavailable. Available results are shown below."
                  : emptySearchOutcome(status, sources) === "unavailable"
                    ? "Search could not be completed. Check your connection and try again."
                    : "Some sources did not respond, so a match may be missing.")}
              </p>
              <button type="button" className="mac-secondary-button" onClick={() => { retry(); inputRef.current?.focus(); }}>
                {t("Retry search")}
              </button>
            </div>
          )}

          {trimmed && !directInput && (status === "typing" || status === "loading") && (
            <p role="status" className="mb-5 flex items-center gap-2 text-[13px] text-ink-muted">
              <Loader2 aria-hidden="true" size={16} className="animate-spin text-ink-subtle" />
              {t(hasResults ? "Searching other sources…" : "Looking…")}
            </p>
          )}

          {inputKind === "magnet" && (
            <div className="mb-5">
              <Suspense fallback={null}>
                <MagnetCard raw={trimmed} onClose={close} />
              </Suspense>
            </div>
          )}

          {inputKind === "video" && (
            <div className="mb-5">
              <Suspense fallback={null}>
                <UrlCard raw={trimmed} onClose={close} />
              </Suspense>
            </div>
          )}

          {inputKind === "link" && (
            <p role="status" className="vayra-surface p-4 text-[13.5px] text-ink-muted">
              {t("This link cannot be opened here. Use a direct video URL such as a link ending in .mp4.")}
            </p>
          )}

          {trimmed && !directInput && results?.intent && (
            <button
              type="button"
              onClick={onIntent}
              className="mb-5 flex min-h-14 w-full items-center gap-3.5 rounded-2xl border border-accent/35 bg-accent/[0.08] px-5 py-3 text-start transition-[background-color,border-color] duration-150 hover:border-accent/55 hover:bg-accent/[0.13]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/18 text-accent">
                {results.intent.kind === "year" ? (
                  <CalendarRange size={16} strokeWidth={2.1} />
                ) : (
                  <Tag size={16} strokeWidth={2.1} />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="vayra-kicker text-accent">
                  {t("Browse")}
                </span>
                <span className="truncate text-[14.5px] font-semibold text-ink">
                  {results.intent.kind === "year"
                    ? t("Movies from {year}", { year: results.intent.year })
                    : t(results.intent.mediaType === "movie" ? "{genre} movies" : "{genre} shows", { genre: t(results.intent.genre) })}
                </span>
              </span>
              <CornerDownLeft size={15} className="ms-auto shrink-0 text-ink-subtle" />
            </button>
          )}

          {trimmed && !directInput && (
            <Suspense fallback={null}>
              <AiSearchSection query={trimmed} onClose={close} runSignal={aiRunSignal} />
            </Suspense>
          )}

          {trimmed && !directInput && hasResults && results && (
            <div className="flex flex-col gap-8 pb-12">
              {results.topMatch && <TopMatch match={results.topMatch} onClose={close} />}
              <LiveTvRow items={results.liveTv} onClose={close} />
              <AddonHits hits={results.addons} onClose={close} />
              <PeopleRow people={results.people} onClose={close} />
              <div className="grid gap-8 lg:grid-cols-2">
                <MetaList title={t("Movies")} items={results.movies} onClose={close} />
                <MetaList title={t("Series")} items={results.series} onClose={close} />
              </div>
              <AnimeRow items={results.anime} onClose={close} />
              <AddonResults groups={results.addonGroups} onClose={close} />
            </div>
          )}

          {noResults && !directInput && (
            <div role="status" className="flex flex-col items-center gap-3 pt-16 text-center">
              <span className="text-[17px] font-semibold text-ink">{t("No matches for \"{query}\"", { query: trimmed })}</span>
              <span className="max-w-[44ch] text-[14px] text-ink-muted">
                {t("Try a different spelling, a person's name, a year like \"1972\", or a genre like \"Horror\".")}
              </span>
            </div>
          )}

        </div>
      </div>
      {guideOpen && (
        <Suspense fallback={null}>
          <GuideModal onClose={() => setGuideOpen(false)} />
        </Suspense>
      )}
    </div>,
    document.body,
  );
}

function Hint({ showNav }: { showNav: boolean }) {
  return (
    <span className="hidden shrink-0 items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-subtle sm:flex">
      {showNav && (
        <>
          <kbd className="rounded-md border border-edge-soft/80 bg-canvas/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            ↑↓
          </kbd>
          <kbd className="rounded-md border border-edge-soft/80 bg-canvas/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            ↵
          </kbd>
        </>
      )}
      <kbd className="rounded-md border border-edge-soft/80 bg-canvas/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
        Esc
      </kbd>
    </span>
  );
}
