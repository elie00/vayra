import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Calendar, Film, Layers, LayoutGrid, Radio, Sparkles, Tv } from "lucide-react";
import { BackToTop } from "@/components/back-to-top";
import { CollectionsRow } from "@/components/collections-row";
import { CriticsPick } from "@/components/critics-pick";
import { LazyMount } from "@/components/lazy-mount";
import { DiscoveryQueueCta } from "@/components/discovery-queue-cta";
import { AskHarbor } from "@/components/search/ask-harbor";
import { FeaturedBanner } from "@/components/featured-banner";
import { AwardTiles } from "@/components/award-tiles";
import { GenreTiles } from "@/components/genre-tiles";
import { LanguageTiles } from "@/components/language-tiles";
import { ScrollRootContext } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { fetchCriticsPickList, fetchFeatured, getPool, selectDailyRows, type FeedItem } from "@/lib/feed";
import { getStore, subscribe as subscribeTaste } from "@/lib/discover/store";
import { getDownvotedIds, getUpvotedIds, subscribePrefs } from "@/lib/feed/preferences";
import { recentlyPlayed, subscribePlayback, watchTitleKey } from "@/lib/playback-history";
import { useParental, type LockableTab } from "@/lib/parental";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView, type View } from "@/lib/view";
import { Rail } from "./discover/discover-rail";
import { useDedupedRows } from "./discover/use-deduped-rows";
import { ANCHOR_AWARDS, ANCHOR_TOP_RATED } from "@/lib/feed/daily-rows-anchors";
import { CatalogCustomizeBar } from "@/components/catalog/customize-bar";
import { RowControls } from "@/views/home/row-controls";
import { useT } from "@/lib/i18n";
import {
  applyPageRows,
  hasPageRowChanges,
  movePageRow,
  orderedRowKeys,
  renamePageRow,
  resetPageRows,
  togglePageRowHidden,
  usePageRows,
} from "@/lib/page-rows";
import { isMobileTauri } from "@/lib/platform";
import { MobileDiscover } from "@/mobile/discover";

const MAX_RAIL_PAGES = 10;
const MIN_PAGE_YIELD = 4;
const ROW_COUNT = 14;
const DEDUP_PRIORITY = [ANCHOR_TOP_RATED, ANCHOR_AWARDS];

export function Discover({ active = true }: { active?: boolean }) {
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);
  useScrollMemory("discover", scrollRef, active);

  const { settings } = useSettings();
  const { setView, openCollections } = useView();
  const { locked, hiddenTabs } = useParental();
  const t = useT();
  const pageRows = usePageRows("discover");
  const [featured, setFeatured] = useState<Meta[]>([]);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [criticsPickList, setCriticsPickList] = useState<Meta[]>([]);
  const [tasteVersion, setTasteVersion] = useState(0);
  const [rails, setRails] = useState<Record<string, Meta[]>>({});
  const [failedRails, setFailedRails] = useState<Record<string, boolean>>({});
  const [retryTick, setRetryTick] = useState(0);
  const railPagesRef = useRef<Record<string, number>>({});
  const railExhaustedRef = useRef<Record<string, boolean>>({});
  const railLoadingRef = useRef<Record<string, boolean>>({});
  const genRef = useRef(0);

  const dailyRows = useMemo(
    () => selectDailyRows(settings.tmdbKey, getStore().affinity, settings, ROW_COUNT),
    [settings],
  );
  const rowSig = useMemo(() => dailyRows.map((r) => r.id).join("|"), [dailyRows]);

  useEffect(() => {
    let cancelled = false;
    fetchFeatured(settings.tmdbKey, settings).then((m) => !cancelled && setFeatured(m));
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, settings.tmdbLanguage, settings.region, settings.feedLocaleBias, settings.preferredLanguages, tasteVersion, settings]);

  useEffect(() => {
    let cancelled = false;
    const hidden = new Set<string>([...getDownvotedIds(), ...getUpvotedIds()]);
    getPool(settings.tmdbKey).then(async (p) => {
      if (cancelled) return;
      const { filterQueuePool } = await import("@/lib/feed/skipped");
      setQueue(filterQueuePool(p).filter((it) => !hidden.has(it.meta.id)));
    });
    fetchCriticsPickList(settings.tmdbKey, settings).then(
      (list) => !cancelled && setCriticsPickList(list.filter((x) => !hidden.has(x.id))),
    );
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, settings.region, settings.feedLocaleBias, settings.preferredLanguages, settings.tmdbLanguage, settings]);

  useEffect(() => {
    let timer = 0;
    const bump = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setTasteVersion((v) => v + 1), 600);
    };
    const dropWatched = () => {
      const watched = recentlyPlayed();
      if (watched.ids.size === 0 && watched.titles.size === 0) return;
      const isWatched = (m: Meta) =>
        watched.ids.has(m.id) || watched.titles.has(watchTitleKey(m.name));
      setFeatured((prev) => {
        const next = prev.filter((m) => !isWatched(m));
        return next.length === prev.length ? prev : next;
      });
      setQueue((prev) => {
        const next = prev.filter((it) => !isWatched(it.meta));
        return next.length === prev.length ? prev : next;
      });
      setCriticsPickList((prev) => {
        const next = prev.filter((m) => !isWatched(m));
        return next.length === prev.length ? prev : next;
      });
    };
    const offTaste = subscribeTaste(bump);
    const offPrefs = subscribePrefs(() => {
      const blocked = new Set<string>([...getDownvotedIds(), ...getUpvotedIds()]);
      setFeatured((prev) => prev.filter((m) => !blocked.has(m.id)));
      setQueue((prev) => prev.filter((it) => !blocked.has(it.meta.id)));
      setCriticsPickList((prev) => prev.filter((m) => !blocked.has(m.id)));
      bump();
    });
    const offPlayback = subscribePlayback(() => {
      dropWatched();
      bump();
    });
    return () => {
      clearTimeout(timer);
      offTaste();
      offPrefs();
      offPlayback();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const watched = recentlyPlayed();
    if (watched.ids.size === 0 && watched.titles.size === 0) return;
    const isWatched = (m: Meta) =>
      watched.ids.has(m.id) || watched.titles.has(watchTitleKey(m.name));
    setFeatured((prev) => prev.filter((m) => !isWatched(m)));
    setQueue((prev) => prev.filter((it) => !isWatched(it.meta)));
    setCriticsPickList((prev) => prev.filter((m) => !isWatched(m)));
  }, [active]);

  const ensureLoaded = useCallback(
    (railId: string) => {
      if (railPagesRef.current[railId] != null) return;
      if (railLoadingRef.current[railId]) return;
      const def = dailyRows.find((r) => r.id === railId);
      if (!def) return;
      const gen = genRef.current;
      railLoadingRef.current[railId] = true;
      def
        .fetch(1)
        .then((list) => {
          if (genRef.current !== gen) return;
          railPagesRef.current[railId] = 1;
          if (list.length < MIN_PAGE_YIELD) railExhaustedRef.current[railId] = true;
          setFailedRails((prev) => (prev[railId] ? { ...prev, [railId]: false } : prev));
          setRails((prev) => ({ ...prev, [railId]: list }));
        })
        .catch(() => {
          if (genRef.current !== gen) return;
          railPagesRef.current[railId] = 1;
          railExhaustedRef.current[railId] = true;
          setFailedRails((prev) => ({ ...prev, [railId]: true }));
          setRails((prev) => ({ ...prev, [railId]: [] }));
        })
        .finally(() => {
          if (genRef.current === gen) railLoadingRef.current[railId] = false;
        });
    },
    [dailyRows],
  );

  const ensureLoadedRef = useRef(ensureLoaded);
  ensureLoadedRef.current = ensureLoaded;

  useEffect(() => {
    genRef.current += 1;
    setRails({});
    setFailedRails({});
    railPagesRef.current = {};
    railExhaustedRef.current = {};
    railLoadingRef.current = {};
    for (const id of DEDUP_PRIORITY) ensureLoadedRef.current(id);

  }, [rowSig, settings.tmdbKey, settings.region, settings.streaming, settings.tmdbLanguage, retryTick]);

  const loadMore = useCallback(
    (railId: string) => {
      if (railLoadingRef.current[railId]) return;
      if (railExhaustedRef.current[railId]) return;
      const cur = railPagesRef.current[railId] ?? 1;
      if (cur >= MAX_RAIL_PAGES) return;
      const def = dailyRows.find((r) => r.id === railId);
      if (!def) return;
      const next = cur + 1;
      railLoadingRef.current[railId] = true;
      def
        .fetch(next)
        .then((list) => {
          railPagesRef.current[railId] = next;
          if (list.length < MIN_PAGE_YIELD) railExhaustedRef.current[railId] = true;
          setRails((prev) => ({ ...prev, [railId]: [...(prev[railId] ?? []), ...list] }));
        })
        .catch(() => {})
        .finally(() => {
          railLoadingRef.current[railId] = false;
        });
    },
    [dailyRows],
  );

  const featuredIds = useMemo(() => new Set(featured.map((m) => m.id)), [featured]);

  const criticsPick = useMemo(() => {
    const candidates = criticsPickList.filter(
      (m) => !featuredIds.has(m.id) && m.background && m.description,
    );
    if (candidates.length === 0) {
      return criticsPickList.find((m) => !featuredIds.has(m.id)) ?? null;
    }
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getUTCFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    return candidates[dayOfYear % candidates.length];
  }, [criticsPickList, featuredIds]);

  const order = useMemo(() => dailyRows.map((r) => r.id), [dailyRows]);
  const deduped = useDedupedRows(rails, order, featuredIds, criticsPick?.id, DEDUP_PRIORITY);

  const railItems = useMemo(
    () => dailyRows.map((r) => ({ key: r.id, title: r.shelf.title })),
    [dailyRows],
  );
  const railKeys = useMemo(() => railItems.map((r) => r.key), [railItems]);
  const visibleRails = useMemo(
    () => applyPageRows(railItems, pageRows.custom, false),
    [railItems, pageRows.custom],
  );
  const editRails = useMemo(
    () =>
      applyPageRows(railItems, pageRows.custom, true).filter((item) => {
        const d = deduped[item.key];
        return d == null || d.length > 0;
      }),
    [railItems, pageRows.custom, deduped],
  );
  const orderKeys = useMemo(
    () => orderedRowKeys(railKeys, pageRows.custom),
    [railKeys, pageRows.custom],
  );

  const universes = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      icon: typeof Film;
      onClick: () => void;
      hide?: boolean;
      parentalKey?: LockableTab;
    }> = [
      { id: "movies", label: "nav.movies", icon: Film, onClick: () => setView("movies" as View), parentalKey: "movies" },
      { id: "shows", label: "nav.shows", icon: Tv, onClick: () => setView("shows" as View), parentalKey: "shows" },
      { id: "anime", label: "nav.anime", icon: Sparkles, onClick: () => setView("anime" as View), hide: settings.hideContent.anime, parentalKey: "anime" },
      { id: "collections", label: "Collections", icon: Layers, onClick: openCollections, hide: !settings.tmdbKey },
      { id: "catalogs", label: "nav.catalogs", icon: LayoutGrid, onClick: () => setView("catalogs" as View), parentalKey: "discover" },
      { id: "calendar", label: "nav.calendar", icon: Calendar, onClick: () => setView("calendar" as View), parentalKey: "calendar" },
      { id: "live", label: "nav.live", icon: Radio, onClick: () => setView("live" as View), hide: settings.hideContent.liveTv, parentalKey: "liveTv" },
    ];
    return items.filter((it) => !it.hide && !(locked && it.parentalKey && hiddenTabs[it.parentalKey]));
  }, [settings.hideContent.anime, settings.hideContent.liveTv, settings.tmdbKey, locked, hiddenTabs, setView, openCollections]);

  if (isMobileTauri())
    return (
      <MobileDiscover
        featured={featured}
        rails={visibleRails}
        deduped={deduped}
        loadMore={loadMore}
        ensureLoaded={ensureLoaded}
      />
    );

  return (
    <main ref={scrollCb} className="flex-1 overflow-y-auto px-5 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-28">
      <ScrollRootContext.Provider value={scrollEl}>
        <div data-tauri-drag-region className="flex flex-col gap-12">
          <header className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="vayra-kicker">{t("Discoveries")}</span>
                <h1 className="mac-page-title">{t("Explore")}</h1>
                <p className="max-w-[58ch] text-[14px] leading-relaxed text-ink-muted">
                  {t("Browse curated shelves, genres, origins, and universes.")}
                </p>
              </div>
              <CatalogCustomizeBar
                editMode={pageRows.editMode}
                hasChanges={hasPageRowChanges(pageRows.custom)}
                onToggleEdit={() => pageRows.setEditMode((v) => !v)}
                onReset={() => pageRows.persist(resetPageRows())}
              />
            </div>

            {universes.length > 0 && (
              <nav aria-label={t("Explore categories")} className="flex flex-wrap items-center gap-2">
                {universes.map(({ id, label, icon: Icon, onClick }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={onClick}
                    className="group inline-flex min-h-10 items-center gap-2 rounded-xl border border-edge-soft/75 bg-surface/85 px-3.5 py-2 text-[13px] font-medium text-ink-muted transition-[border-color,background-color,color,transform] duration-150 hover:-translate-y-0.5 hover:border-edge hover:bg-elevated hover:text-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <Icon size={14} strokeWidth={2} className="text-ink-subtle transition-colors group-hover:text-ink" />
                    <span>{t(label)}</span>
                    <ArrowUpRight size={12} strokeWidth={2} className="text-ink-subtle/70 opacity-60 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0" />
                  </button>
                ))}
              </nav>
            )}
            <div className="vayra-header-rule" aria-hidden="true" />
          </header>

          <AskHarbor />
          {Object.values(failedRails).some(Boolean) && (
            <div className="vayra-surface flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <AlertCircle size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" aria-hidden="true" />
                <p role="alert" className="text-[13.5px] text-ink-muted">
                  {t("Some recommendations could not be loaded. Check your connection and try again.")}
                </p>
              </div>
              <button
                type="button"
                className="mac-secondary-button"
                onClick={() => setRetryTick((n) => n + 1)}
              >
                {t("Retry")}
              </button>
            </div>
          )}
          <FeaturedBanner items={featured} />

          {pageRows.editMode
            ? editRails.map((item) => {
                const hidden = pageRows.custom.hidden.includes(item.key);
                const idx = orderKeys.indexOf(item.key);
                return (
                  <div key={item.key}>
                    <RowControls
                      name={t(item.title)}
                      hidden={hidden}
                      canMoveUp={idx > 0}
                      canMoveDown={idx >= 0 && idx < orderKeys.length - 1}
                      onMoveUp={() => pageRows.persist(movePageRow(pageRows.custom, railKeys, item.key, -1))}
                      onMoveDown={() => pageRows.persist(movePageRow(pageRows.custom, railKeys, item.key, 1))}
                      onToggleHidden={() => pageRows.persist(togglePageRowHidden(pageRows.custom, item.key))}
                      onRename={(label) => pageRows.persist(renamePageRow(pageRows.custom, item.key, label))}
                      onResetName={() => pageRows.persist(renamePageRow(pageRows.custom, item.key, ""))}
                      isRenamed={item.key in pageRows.custom.renamed}
                    />
                    {!hidden && (
                      <Rail
                        railId={item.key}
                        allRails={dailyRows}
                        deduped={deduped}
                        loadMore={loadMore}
                        ensureLoaded={ensureLoaded}
                        titleOverride={item.title}
                      />
                    )}
                  </div>
                );
              })
            : visibleRails.map((item, i) => (
                <Fragment key={item.key}>
                  <LazyMount minHeight={340}>
                    <Rail
                      railId={item.key}
                      allRails={dailyRows}
                      deduped={deduped}
                      loadMore={loadMore}
                      ensureLoaded={ensureLoaded}
                      titleOverride={item.title}
                    />
                  </LazyMount>

                  {i === 0 && <GenreTiles />}
                  {i === 1 && queue.length > 0 && <DiscoveryQueueCta items={queue} />}
                  {i === 2 && <LanguageTiles />}
                  {i === 3 && settings.tmdbKey && (
                    <LazyMount minHeight={260}>
                      <CollectionsRow />
                    </LazyMount>
                  )}
                  {i === 4 && criticsPick && (
                    <LazyMount minHeight={580}>
                      <CriticsPick meta={criticsPick} />
                    </LazyMount>
                  )}
                  {i === 5 && <AwardTiles />}
                </Fragment>
              ))}
        </div>
      </ScrollRootContext.Provider>
      <BackToTop scrollRef={scrollRef} />
    </main>
  );
}

export { Discover as DiscoverView };
