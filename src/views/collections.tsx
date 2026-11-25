import { ArrowLeft, ArrowUpDown, RotateCcw, Search, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { CollectionCard } from "@/components/collection-card";
import { HarborLoader } from "@/components/harbor-loader";
import { COLLECTION_CATEGORIES, COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import { useT } from "@/lib/i18n";
import {
  cleanCollectionTitle,
  tmdbSearchCollections,
  type CollectionHit,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { layoutHasGlobalBack } from "@/lib/theme";
import { useScrollMemory, useView } from "@/lib/view";
import { FeaturedCollectionStage } from "./collections/featured-stage";
import { useCategoryFeed } from "./collections/use-category-feed";

const FEED_QUERY = "collection";

type SortMode = "curated" | "alpha";

export function CollectionsView() {
  const t = useT();
  const { settings } = useSettings();
  const { goBack, setView } = useView();
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("collections", scrollRef);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sortMode, setSortMode] = useState<SortMode>("curated");
  const [stuck, setStuck] = useState(false);
  const stickySentinelRef = useRef<HTMLDivElement>(null);
  const searchActive = query.trim().length >= 2;
  const remoteQuery = searchActive ? query.trim() : category === "All" ? FEED_QUERY : "";

  const [hits, setHits] = useState<CollectionHit[]>([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const queryEpoch = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const curated = useMemo(() => {
    const base =
      category === "All"
        ? COLLECTIONS_CATALOG
        : COLLECTIONS_CATALOG.filter((c) => c.cats.includes(category));
    if (sortMode === "alpha") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    return base;
  }, [category, sortMode]);

  const curatedNames = useMemo(
    () => new Set(COLLECTIONS_CATALOG.map((c) => c.name.toLowerCase())),
    [],
  );

  const catFeed = useCategoryFeed({
    tmdbKey: settings.tmdbKey,
    category,
    active: Boolean(settings.tmdbKey) && !searchActive && category !== "All",
    excludeNames: curatedNames,
    stripSuffix: cleanCollectionTitle,
  });

  useEffect(() => {
    queryEpoch.current += 1;
    setHits([]);
    setPage(0);
    setDone(!remoteQuery || !settings.tmdbKey);
    setLoading(false);
    loadingRef.current = false;
  }, [remoteQuery, settings.tmdbKey]);

  useEffect(() => {
    const el = stickySentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setStuck(!entries[0]?.isIntersecting),
      { root, rootMargin: "-96px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (done || !remoteQuery || !settings.tmdbKey) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        const next = page + 1;
        const epoch = queryEpoch.current;
        const delay = searchActive && next === 1 ? 300 : 0;
        const timer = window.setTimeout(() => {
          if (queryEpoch.current !== epoch) return;
          tmdbSearchCollections(settings.tmdbKey, remoteQuery, next)
            .then(({ hits: batch, totalPages }) => {
              if (queryEpoch.current !== epoch) return;
              setPage(next);
              if (batch.length === 0 || next >= totalPages) setDone(true);
              setHits((prev) => {
                const seen = new Set(prev.map((h) => h.id));
                const fresh = batch.filter(
                  (h) =>
                    !seen.has(h.id) &&
                    !(
                      remoteQuery === FEED_QUERY &&
                      curatedNames.has(cleanCollectionTitle(h.name).toLowerCase())
                    ),
                );
                return [...prev, ...fresh];
              });
            })
            .catch(() => {
              if (queryEpoch.current === epoch) setDone(true);
            })
            .finally(() => {
              if (queryEpoch.current !== epoch) return;
              loadingRef.current = false;
              setLoading(false);
            });
        }, delay);
        return () => window.clearTimeout(timer);
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [remoteQuery, page, done, searchActive, settings.tmdbKey, curatedNames]);

  const resetFilters = () => {
    setQuery("");
    setCategory("All");
    setSortMode("curated");
  };

  const gridClass =
    "grid grid-cols-1 gap-5 sm:grid-cols-2 max-sm:gap-3.5 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <main ref={scrollRef} className="absolute inset-0 z-30 overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col px-12 pb-24 max-sm:px-4">
        {/* Page Header */}
        <header className="flex flex-wrap items-end justify-between gap-4 pt-24 max-sm:pt-[calc(4.5rem+var(--harbor-status-bar,1.75rem))]">
          <div className="flex items-center gap-5">
            {!layoutHasGlobalBack() && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t("Back")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-surface/85 text-ink transition-colors hover:border-edge hover:bg-elevated max-sm:hidden"
              >
                <ArrowLeft size={19} strokeWidth={2.2} className="dir-icon" />
              </button>
            )}
            <div className="flex flex-col">
              <span className="vayra-kicker">{t("VAYRA Anthology")}</span>
              <h1 className="mac-page-title mt-1 max-sm:type-title-1">{t("Collections")}</h1>
              <p className="mt-1.5 text-[14px] text-ink-muted max-sm:type-footnote">
                {t("Complete sagas and film universes, curated and tracked as you watch.")}
              </p>
            </div>
          </div>

          {!searchActive && settings.tmdbKey && (
            <div className="vayra-pill-track" role="group" aria-label={t("Sort collections")}>
              <span className="inline-flex items-center gap-1 px-2 text-[11px] font-medium text-ink-subtle">
                <ArrowUpDown size={12} />
              </span>
              {(
                [
                  { id: "curated", label: t("VAYRA picks") },
                  { id: "alpha", label: t("A–Z") },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={sortMode === option.id}
                  onClick={() => setSortMode(option.id)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    sortMode === option.id
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {!settings.tmdbKey ? (
          <div className="vayra-surface mt-10 flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
            <p className="max-w-md text-[15px] leading-relaxed text-ink-muted">
              {t("Add a TMDB key in Settings to browse collections.")}
            </p>
            <button
              type="button"
              onClick={() => setView("settings")}
              className="mac-primary-button"
            >
              <Settings size={14} strokeWidth={2.2} />
              <span>{t("Open Settings")}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Editorial Spotlight Stage */}
            {!searchActive && category === "All" && (
              <div className="mt-7">
                <FeaturedCollectionStage tmdbKey={settings.tmdbKey} />
              </div>
            )}

            {/* Sticky Search & Category Rail */}
            <div ref={stickySentinelRef} aria-hidden="true" className="h-px" />
            <div className="sticky top-20 z-40 mt-7 max-sm:top-[calc(4rem+var(--harbor-status-bar,1.75rem))] max-sm:mt-5">
              <div
                className={`flex flex-col gap-3 transition-[background-color,border-color,box-shadow,padding] duration-300 ${
                  stuck
                    ? "rounded-2xl border border-edge-soft/80 bg-canvas/88 px-5 py-3.5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
                    : "rounded-2xl border border-transparent px-0 py-0"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {stuck && (
                    <span className="hidden shrink-0 font-display text-[18px] font-semibold tracking-tight text-ink sm:inline">
                      {t("Collections")}
                    </span>
                  )}
                  <div className="relative w-full max-w-md">
                    <Search
                      size={16}
                      strokeWidth={2}
                      className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-subtle"
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("Search sagas and collections")}
                      placeholder={t("Search a saga, franchise or universe...")}
                      spellCheck={false}
                      className="h-11 w-full rounded-full border border-edge-soft bg-surface/85 ps-11 pe-10 text-[14px] text-ink placeholder:text-ink-subtle transition-colors focus:border-ink-subtle focus:outline-none max-sm:h-12 max-sm:text-[16px]"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label={t("Clear search")}
                        className="absolute end-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
                      >
                        <X size={14} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                  {(category !== "All" || searchActive || sortMode !== "curated") && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-edge-soft bg-surface/75 px-3 text-[12px] font-medium text-ink-muted transition-colors hover:border-edge hover:bg-elevated hover:text-ink"
                    >
                      <RotateCcw size={12.5} />
                      <span>{t("Reset")}</span>
                    </button>
                  )}
                </div>

                {!searchActive && (
                  <div className="flex flex-wrap items-center gap-1.5 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:flex-nowrap max-sm:gap-2 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden">
                    {["All", ...COLLECTION_CATEGORIES].map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={category === c}
                        onClick={() => setCategory(c)}
                        className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap max-sm:py-0 max-sm:text-[14px] ${
                          category === c
                            ? "bg-ink text-canvas"
                            : "bg-surface/85 text-ink-muted ring-1 ring-edge-soft/75 hover:bg-elevated hover:text-ink"
                        }`}
                      >
                        {t(c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Catalog Sections */}
            <div className="mt-8 flex flex-col gap-12">
              {!searchActive && (
                <section className="flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">
                        {category === "All" ? t("VAYRA Selection") : t(category)}
                      </h2>
                      <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                        {curated.length}
                      </span>
                    </div>
                  </div>
                  <div className={gridClass}>
                    {curated.map((c) => (
                      <div
                        key={`${c.id}-${c.name}`}
                        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 230px" }}
                      >
                        <CollectionCard id={c.id} name={c.name} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!searchActive && category !== "All" && (
                <section className="flex flex-col gap-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">
                      {t("More {category}", { category: t(category) })}
                    </h2>
                    {catFeed.hits.length > 0 && (
                      <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                        {catFeed.hits.length}
                      </span>
                    )}
                  </div>
                  {catFeed.hits.length > 0 && (
                    <div className={gridClass}>
                      {catFeed.hits.map((h) => (
                        <div
                          key={h.id}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 230px" }}
                        >
                          <CollectionCard
                            id={h.id}
                            name={h.name}
                            knownBackdrop={h.backdrop}
                            knownCount={h.count}
                            knownPosters={h.posters}
                            knownYearRange={h.yearRange}
                            knownRating={h.rating}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {!catFeed.done && <div ref={catFeed.sentinelRef} className="h-2" />}
                  {catFeed.loading && (
                    <div className="flex justify-center py-6">
                      <HarborLoader size="sm" />
                    </div>
                  )}
                  {catFeed.done && (
                    <p className="py-4 text-center text-[12.5px] text-ink-subtle">
                      {catFeed.hits.length > 0
                        ? t("That's every {category} collection we could find.", {
                            category: t(category),
                          })
                        : t("No more found for this category.")}
                    </p>
                  )}
                </section>
              )}

              {remoteQuery && (
                <section className="flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">
                        {searchActive
                          ? t('Results for "{query}"', { query: query.trim() })
                          : t("Explore more sagas")}
                      </h2>
                      {hits.length > 0 && (
                        <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                          {hits.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {searchActive && hits.length === 0 && done ? (
                    <div className="vayra-surface flex flex-col items-center justify-center gap-3.5 px-6 py-14 text-center">
                      <p className="text-[14.5px] text-ink-muted">
                        {t("Nothing matched. Try the franchise's first film name.")}
                      </p>
                      <button type="button" onClick={resetFilters} className="mac-secondary-button">
                        <RotateCcw size={13} />
                        <span>{t("Clear search")}</span>
                      </button>
                    </div>
                  ) : (
                    <div className={gridClass}>
                      {hits.map((h) => (
                        <div
                          key={h.id}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 230px" }}
                        >
                          <CollectionCard
                            id={h.id}
                            name={cleanCollectionTitle(h.name)}
                            knownBackdrop={h.backdrop}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {!done && <div ref={sentinelRef} className="h-2" />}
                  {loading && (
                    <div className="flex justify-center py-6">
                      <HarborLoader size="sm" />
                    </div>
                  )}
                  {done && hits.length > 0 && (
                    <p className="py-4 text-center text-[12.5px] text-ink-subtle">
                      {t("End of catalog.")}
                    </p>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
      <BackToTop scrollRef={scrollRef} />
    </main>
  );
}
