import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { HeroCarousel, type Slide } from "@/components/hero-carousel";
import { TmdbNudge } from "@/components/nudge";
import { Row, ScrollRootContext } from "@/components/row";
import {
  applyHomeRowCustomization,
  effectiveOrder,
  moveRow,
  renameRow,
  resetHomeRows,
  toggleRowHidden,
  type HomeRowCustomization,
} from "@/lib/home-customization";
import { StreamingRail } from "@/components/streaming-rail";
import { TopRankCard } from "@/components/top-rank-card";
import { hasTmdbProviderAddon, loadAddonRows, userAddons, type AddonRow } from "@/lib/addons";
import { isAnimeRow } from "@/views/anime";
import { useAuth } from "@/lib/auth";
import { type Meta } from "@/lib/cinemeta";
import { useSettings, type StreamingService } from "@/lib/settings";
import { trackEvent } from "@/lib/discover";
import { saveResumeMs } from "@/lib/resume";
import { episodeFromVideoId, library, libraryPut, type LibraryItem } from "@/lib/stremio";
import { useTrakt } from "@/lib/trakt/provider";
import { buildTraktHomeRows } from "@/lib/trakt/home-rails";
import { fetchWatchedKeySet } from "@/lib/trakt/history";
import { useScrollMemory, useView } from "@/lib/view";
import { CustomizableRows } from "./home/customizable-rows";
import { CustomizeBar } from "./home/customize-bar";
import { CWSection } from "./home/cw-section";
import {
  buildAnimeHomeRows,
  buildCinemetaRows,
  buildTmdbRows,
  isStreamingServiceRow,
  MAX_PER_ROW,
  mergeRows,
} from "./home/home-rows";
import type { HomeRow } from "./home/home-types";
import { RowSkeleton } from "./home/row-skeleton";

export function Home({ active = true }: { active?: boolean }) {
  const { authKey } = useAuth();
  const { settings, update } = useSettings();
  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [animeRows, setAnimeRows] = useState<HomeRow[]>([]);
  const [traktRows, setTraktRows] = useState<HomeRow[]>([]);
  const [traktWatched, setTraktWatched] = useState<Set<string>>(() => new Set());
  const [heroPool, setHeroPool] = useState<Meta[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [tmdbProvidedByAddon, setTmdbProvidedByAddon] = useState(false);
  const { isConnected: traktConnected } = useTrakt();
  const rowsRef = useRef<HomeRow[]>([]);
  const loadingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const loadMore = useCallback((rowKey: string) => {
    if (loadingRef.current.has(rowKey)) return;
    const row = rowsRef.current.find((r) => r.key === rowKey);
    if (!row || !row.fetcher || !row.hasMore || row.metas.length === 0) return;
    if (row.metas.length >= MAX_PER_ROW) return;
    loadingRef.current.add(rowKey);
    const next = row.page + 1;
    row
      .fetcher(next)
      .then((more) => {
        setRows((rs) =>
          rs.map((r) => {
            if (r.key !== rowKey) return r;
            const ids = new Set(r.metas.map((m) => m.id));
            const fresh = more.filter((m) => !ids.has(m.id));
            const combined = [...r.metas, ...fresh];
            const reachedCap = combined.length >= MAX_PER_ROW;
            return {
              ...r,
              metas: reachedCap ? combined.slice(0, MAX_PER_ROW) : combined,
              page: next,
              hasMore: !reachedCap && more.length > 0,
            };
          }),
        );
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current.delete(rowKey);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isClassic = settings.homeMode === "classic";

      let built: { rows: HomeRow[]; hero: Meta[] } = { rows: [], hero: [] };
      if (!isClassic) {
        built = settings.tmdbKey
          ? await buildTmdbRows(settings).catch(() => ({ rows: [] as HomeRow[], hero: [] as Meta[] }))
          : await buildCinemetaRows().catch(() => ({ rows: [] as HomeRow[], hero: [] as Meta[] }));
        if (built.rows.length === 0) {
          built = await buildCinemetaRows().catch(() => ({ rows: [] as HomeRow[], hero: [] as Meta[] }));
        }
      }
      if (cancelled) return;
      setRows(mergeRows(built.rows, []));
      setHeroPool(built.hero);

      const dedupRows = isClassic ? false : !settings.homeShowAllAddonRows;
      const addons = (await loadAddonRows(authKey, { dedup: dedupRows }).catch(
        () => [] as AddonRow[],
      )).filter((a) => a.type !== "tv" && a.type !== "channel");
      if (cancelled) return;
      const filtered = isClassic
        ? addons
        : addons.filter((a) => !isAnimeRow(a) && !isStreamingServiceRow(a.name));
      setRows(mergeRows(built.rows, filtered, { dedup: dedupRows }));

      if (authKey) {
        const installed = await userAddons(authKey).catch(() => []);
        if (cancelled) return;
        setTmdbProvidedByAddon(hasTmdbProviderAddon(installed));
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [authKey, settings.tmdbKey, settings.region, settings.homeMode, settings.homeShowAllAddonRows]);

  useEffect(() => {
    if (settings.hideContent.anime || settings.homeMode === "classic") {
      setAnimeRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const built = await buildAnimeHomeRows();
      if (cancelled) return;
      setAnimeRows(built);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.hideContent.anime, settings.homeMode]);

  useEffect(() => {
    if (!traktConnected) {
      setTraktRows([]);
      setTraktWatched(new Set());
      return;
    }
    let cancelled = false;
    buildTraktHomeRows(settings.tmdbKey)
      .then((rs) => {
        if (!cancelled) setTraktRows(rs);
      })
      .catch(() => {});
    fetchWatchedKeySet()
      .then((set) => {
        if (!cancelled) setTraktWatched(set);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traktConnected, settings.tmdbKey]);

  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!authKey) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      library(authKey)
        .then((libItems) => {
          if (cancelled) return;
          setItems(libItems);
          for (const i of libItems) {
            if (i.state?.timeOffset && i.state.timeOffset > 0) {
              const se = episodeFromVideoId(i.state.video_id);
              saveResumeMs(
                i._id,
                i.state.timeOffset,
                i.state.season ?? se?.season,
                i.state.episode ?? se?.episode,
              );
            }
            if ((i.removed && !i.temp) || trackedRef.current.has(i._id)) continue;
            trackedRef.current.add(i._id);
            const offset = i.state?.timeOffset ?? 0;
            const duration = i.state?.duration ?? 0;
            const progress = duration > 0 ? offset / duration : 0;
            const flagged = (i.state?.flaggedWatched ?? 0) > 0;
            if (flagged || progress > 0.85) trackEvent(i._id, "watched");
            else if (progress > 0.05) trackEvent(i._id, "play");
            else if (!i.temp) trackEvent(i._id, "watchlist");
          }
        })
        .catch(console.error);
    };
    load();
    if (active) {
      const refresh = () => {
        if (document.visibilityState === "visible") load();
      };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      const poll = window.setInterval(() => {
        if (document.visibilityState === "visible") load();
      }, 30000);
      return () => {
        cancelled = true;
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", refresh);
        window.clearInterval(poll);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [authKey, active]);

  const continueWatching = useMemo(() => {
    const eligible = items
      .filter(
        (i) =>
          !dismissed.has(i._id) &&
          (!i.removed || i.temp) &&
          i.state &&
          i.state.timeOffset > 0,
      )
      .sort((a, b) => Date.parse(b._mtime) - Date.parse(a._mtime));
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    const seenId = new Set<string>();
    const seenKey = new Set<string>();
    const out: typeof eligible = [];
    for (const i of eligible) {
      if (seenId.has(i._id)) continue;
      const key = `${i.type}:${norm(i.name ?? "")}`;
      if (seenKey.has(key)) continue;
      seenId.add(i._id);
      seenKey.add(key);
      out.push(i);
      if (out.length >= 20) break;
    }
    return out;
  }, [items, dismissed]);

  const onDismissCw = useCallback(
    (id: string) => {
      setDismissed((prev) => new Set(prev).add(id));
      if (!authKey) return;
      const target = items.find((i) => i._id === id);
      if (!target) return;
      void libraryPut(authKey, {
        ...target,
        removed: true,
        temp: false,
        _mtime: new Date().toISOString(),
      }).catch(() => {});
    },
    [authKey, items],
  );

  const heroSlides = useMemo<Slide[]>(() => {
    const seen = new Set<string>();
    const out: Slide[] = [];
    for (const m of heroPool) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ meta: m, rank: { label: m.type === "series" ? "TV" : "Movies", position: out.length + 1 } });
      if (out.length >= 4) break;
    }
    return out;
  }, [heroPool]);

  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);
  useScrollMemory("home", scrollRef, active);

  const { homeResetTick } = useView();
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [homeResetTick]);

  const displayed = useMemo(() => {
    const FIRST_PAGE = 20;
    const seen = new Set<string>();
    for (const s of heroSlides) seen.add(s.meta.id);
    const isClassic = settings.homeMode === "classic";
    if (isClassic) {
      return { top10: [] as Meta[], top10Title: "", rest: rows };
    }
    const firstRow = rows[0];
    const firstRowHead = (firstRow?.metas ?? []).slice(0, FIRST_PAGE);
    const top10 = firstRowHead.filter((m) => !seen.has(m.id)).slice(0, 10);
    for (const m of top10) seen.add(m.id);
    const rest: HomeRow[] = [];
    for (const row of rows.slice(1)) {
      const head = row.metas.slice(0, FIRST_PAGE);
      const tail = row.metas.slice(FIRST_PAGE);
      const filteredHead = row.noDedup ? head : head.filter((m) => !seen.has(m.id));
      if (!row.noDedup && filteredHead.length < 4) continue;
      for (const m of filteredHead) seen.add(m.id);
      rest.push({ ...row, metas: [...filteredHead, ...tail] });
    }
    return { top10, top10Title: firstRow?.name ?? "", rest };
  }, [rows, heroSlides, settings.homeMode]);

  const top10 = displayed.top10;
  const restRows = displayed.rest;

  const homeRowsCustom = settings.homeRows;
  const allCustomizableRows = useMemo(
    () => [...traktRows, ...restRows, ...animeRows],
    [traktRows, restRows, animeRows],
  );
  const visibleRows = useMemo(
    () => applyHomeRowCustomization(allCustomizableRows, homeRowsCustom, false),
    [allCustomizableRows, homeRowsCustom],
  );
  const editRows = useMemo(
    () => applyHomeRowCustomization(allCustomizableRows, homeRowsCustom, true),
    [allCustomizableRows, homeRowsCustom],
  );
  const orderKeys = useMemo(
    () => effectiveOrder(editRows, homeRowsCustom),
    [editRows, homeRowsCustom],
  );

  const mutateHomeRows = useCallback(
    (next: HomeRowCustomization) => update({ homeRows: next }),
    [update],
  );
  const handleMove = useCallback(
    (key: string, delta: -1 | 1) =>
      mutateHomeRows(moveRow(homeRowsCustom, editRows, key, delta)),
    [homeRowsCustom, editRows, mutateHomeRows],
  );
  const handleToggleHidden = useCallback(
    (key: string) => mutateHomeRows(toggleRowHidden(homeRowsCustom, key)),
    [homeRowsCustom, mutateHomeRows],
  );
  const handleRename = useCallback(
    (key: string, label: string) => mutateHomeRows(renameRow(homeRowsCustom, key, label)),
    [homeRowsCustom, mutateHomeRows],
  );

  const enabledServices = useMemo(
    () =>
      settings.tmdbKey
        ? (Object.keys(settings.streaming) as StreamingService[]).filter(
            (s) => settings.streaming[s],
          )
        : [],
    [settings.tmdbKey, settings.streaming],
  );

  return (
    <main
      ref={scrollCb}
      className="flex-1 overflow-y-auto px-5 pt-24 pb-14 sm:px-8 lg:px-12 lg:pt-28"
    >
      <ScrollRootContext.Provider value={scrollEl}>
        <div data-tauri-drag-region className="relative flex flex-col gap-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
            <div className="pointer-events-auto">
              <TmdbNudge suppress={tmdbProvidedByAddon || settings.homeMode === "classic"} />
            </div>
          </div>
          {settings.homeMode !== "classic" && !homeRowsCustom.hidden.includes("hero") && (
            <div data-scroll-anchor="hero" className="relative">
              {editMode && (
                <PinnedRowControls
                  label="Featured hero"
                  hidden={false}
                  onToggleHidden={() => handleToggleHidden("hero")}
                />
              )}
              <HeroCarousel slides={heroSlides} />
              {!editMode && (
                <div className="pointer-events-none absolute -bottom-3 right-5 z-20 flex justify-end [&>*]:pointer-events-auto">
                  <CustomizeBar
                    editMode={editMode}
                    customization={homeRowsCustom}
                    onToggleEdit={() => setEditMode((v) => !v)}
                    onReset={() => mutateHomeRows(resetHomeRows())}
                  />
                </div>
              )}
            </div>
          )}
          {editMode && homeRowsCustom.hidden.includes("hero") && (
            <PinnedRowControls
              label="Featured hero"
              hidden
              onToggleHidden={() => handleToggleHidden("hero")}
            />
          )}
          {!editMode && settings.homeMode !== "classic" && homeRowsCustom.hidden.includes("hero") && (
            <div className="pointer-events-none absolute right-0 top-0 z-20 [&>*]:pointer-events-auto">
              <CustomizeBar
                editMode={editMode}
                customization={homeRowsCustom}
                onToggleEdit={() => setEditMode((v) => !v)}
                onReset={() => mutateHomeRows(resetHomeRows())}
              />
            </div>
          )}
          <div data-scroll-anchor="cw" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 300px" }}>
            <CWSection
              signedIn={!!authKey}
              items={continueWatching}
              watchedSet={traktWatched}
              onDismiss={onDismissCw}
            />
          </div>
          {settings.homeMode !== "classic" && (
            <div data-scroll-anchor="streaming" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 340px" }}>
              <StreamingRail services={enabledServices} />
            </div>
          )}
          {settings.homeMode !== "classic" && top10.length >= 10 && !homeRowsCustom.hidden.includes("top10") && (
            <div data-scroll-anchor="top10" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 380px" }}>
              {editMode && (
                <PinnedRowControls
                  label="Top 10 Trending This Week"
                  hidden={false}
                  onToggleHidden={() => handleToggleHidden("top10")}
                />
              )}
              <Row
                title={rows[0].name.toLowerCase().includes("top") ? rows[0].name : `Top 10 ${rows[0].name}`}
                min={180}
                shape="rank"
              >
                {top10.map((m, i) => (
                  <TopRankCard key={m.id} meta={m} rank={i + 1} />
                ))}
              </Row>
            </div>
          )}
          {editMode && settings.homeMode !== "classic" && top10.length >= 10 && homeRowsCustom.hidden.includes("top10") && (
            <PinnedRowControls
              label="Top 10 Trending This Week"
              hidden
              onToggleHidden={() => handleToggleHidden("top10")}
            />
          )}
          {rows.length === 0 && traktRows.length === 0 && animeRows.length === 0 ? (
            Array.from({ length: 7 }).map((_, i) => <RowSkeleton key={`skel-${i}`} />)
          ) : (
            <CustomizableRows
              rows={editMode ? editRows : visibleRows}
              editMode={editMode}
              customization={homeRowsCustom}
              orderKeys={orderKeys}
              onMove={handleMove}
              onToggleHidden={handleToggleHidden}
              onRename={handleRename}
              onLoadMore={loadMore}
            />
          )}
        </div>
      </ScrollRootContext.Provider>
      {!editMode && settings.homeMode === "classic" && (
        <div className="pointer-events-none fixed bottom-16 right-5 z-30 flex items-center justify-end gap-2 [&>*]:pointer-events-auto">
          <CustomizeBar
            editMode={editMode}
            customization={homeRowsCustom}
            onToggleEdit={() => setEditMode((v) => !v)}
            onReset={() => mutateHomeRows(resetHomeRows())}
          />
        </div>
      )}
      {editMode && (
        <div className="pointer-events-none fixed bottom-16 right-5 z-30 flex items-center justify-end gap-2 [&>*]:pointer-events-auto">
          <CustomizeBar
            editMode={editMode}
            customization={homeRowsCustom}
            onToggleEdit={() => setEditMode((v) => !v)}
            onReset={() => mutateHomeRows(resetHomeRows())}
          />
        </div>
      )}
      <BackToTop scrollRef={scrollRef} />
    </main>
  );
}

function PinnedRowControls({
  label,
  hidden,
  onToggleHidden,
}: {
  label: string;
  hidden: boolean;
  onToggleHidden: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-edge-soft/60 bg-elevated/40 px-4 py-2">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-accent">
          Pinned
        </span>
        {label}
        {hidden && <span className="text-[11.5px] font-normal text-ink-subtle">· currently hidden</span>}
      </span>
      <button
        type="button"
        onClick={onToggleHidden}
        className="h-8 rounded-md border border-edge-soft/60 bg-canvas/70 px-3 text-[12px] font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        {hidden ? "Show" : "Hide"}
      </button>
    </div>
  );
}
