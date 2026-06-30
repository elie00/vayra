import { Check, ChevronDown, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EpisodeJumper } from "@/components/episode-jumper";
import type { Meta } from "@/lib/cinemeta";
import { getEpisodeProgress } from "@/lib/episode-progress";
import { scrollToDataEp } from "@/lib/episode-scroll";
import { franchiseTags, type FranchiseEntry } from "@/lib/providers/anime-detail";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { useSettings } from "@/lib/settings";
import { spoilerMaskFor } from "@/lib/spoilers";
import { fetchWatchedKeySet } from "@/lib/trakt/history";
import { useTrakt } from "@/lib/trakt/provider";
import { useView } from "@/lib/view";
import { useAnilistWatched } from "@/lib/anilist/use-anilist-watched";
import { EpisodeWatchedMenu, type WatchedMenuTarget } from "@/components/episode-watched-menu";
import { manualWatchedVersion, setManualWatchedMany, subscribeManualWatched } from "@/lib/manual-watched";
import { useT } from "@/lib/i18n";
import { AnimeEpisodeRow } from "./anime-episodes/episode-row";
import { AnimeEpisodeStrip } from "./anime-episode-strip";
import { UpcomingBadge } from "./badges";
import { EpisodeGridControls } from "./episode-grid-controls";
import { EpisodeLayoutToggle } from "./episode-layout-toggle";

const WINDOW_STEP = 60;

export function AnimeEpisodes({
  meta,
  episodes,
  franchise,
  currentId,
  scrollRef,
  trackId,
}: {
  meta: Meta;
  episodes: KitsuEpisode[];
  franchise: FranchiseEntry[];
  currentId: string;
  scrollRef: React.RefObject<HTMLElement | null>;
  trackId?: string;
}) {
  const t = useT();
  const { isConnected: traktConnected } = useTrakt();
  const [traktWatched, setTraktWatched] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!traktConnected) {
      setTraktWatched(new Set());
      return;
    }
    let cancelled = false;
    fetchWatchedKeySet()
      .then((set) => {
        if (!cancelled) setTraktWatched(set);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  const { watchedKeys: anilistWatched, completed: anilistCompleted } = useAnilistWatched(
    trackId ?? meta.id,
    episodes,
  );
  const { settings, update } = useSettings();
  const mwVersion = useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);
  const [watchedMenu, setWatchedMenu] = useState<WatchedMenuTarget | null>(null);
  const openWatchedMenu = (
    e: React.MouseEvent,
    season: number,
    episode: number,
    watched: boolean,
  ) => {
    e.preventDefault();
    setWatchedMenu({ x: e.clientX, y: e.clientY, season, episode, watched });
  };

  const progressByNum = useMemo(() => {
    const m = new Map<number, { ratio: number; watched: boolean; startedAt: number }>();
    for (const ep of episodes) {
      m.set(
        ep.number,
        getEpisodeProgress(
          meta.id,
          ep.seasonNumber || 1,
          ep.number,
          ep.length ?? null,
          ep.imdbId ?? null,
          traktWatched,
          undefined,
          anilistWatched,
          undefined,
          ep.imdbSeason,
          ep.imdbEpisode,
        ),
      );
    }
    return m;
  }, [episodes, meta.id, traktWatched, anilistWatched, mwVersion]);
  const progressFor = (ep: KitsuEpisode) =>
    progressByNum.get(ep.number) ?? { ratio: 0, watched: false, startedAt: 0 };
  const nextUpNum = useMemo(() => {
    for (const ep of episodes) {
      if (!progressByNum.get(ep.number)?.watched) return ep.number;
    }
    return null;
  }, [episodes, progressByNum]);
  const spoilerFor = (ep: KitsuEpisode) =>
    spoilerMaskFor(settings, {
      watched: progressByNum.get(ep.number)?.watched ?? false,
      isNextUp: ep.number === nextUpNum,
    });
  const allWatched =
    episodes.length > 0 && episodes.every((ep) => progressByNum.get(ep.number)?.watched);
  const markSeason = (watched: boolean) => {
    if (episodes.length === 0) return;
    setManualWatchedMany(
      meta.id,
      episodes.map((ep) => ({ season: ep.seasonNumber || 1, episode: ep.number })),
      watched,
    );
  };

  const windowed = settings.episodeLayout === "list" || settings.episodeLayout === "strip";
  const [renderCount, setRenderCount] = useState(WINDOW_STEP);
  useEffect(() => {
    setRenderCount(WINDOW_STEP);
  }, [meta.id, settings.episodeLayout]);
  const grow = useCallback(
    () => setRenderCount((c) => (c >= episodes.length ? c : Math.min(episodes.length, c + WINDOW_STEP))),
    [episodes.length],
  );
  const reveal = useCallback(
    (n: number) => setRenderCount((c) => Math.max(c, Math.min(episodes.length, n + 20))),
    [episodes.length],
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listEpisodes = windowed ? episodes.slice(0, renderCount) : episodes;
  const hasMore = windowed && renderCount < episodes.length;
  useEffect(() => {
    if (settings.episodeLayout !== "list" || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) grow();
      },
      { root: scrollRef.current ?? null, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [settings.episodeLayout, hasMore, grow, scrollRef]);

  const didJumpRef = useRef("");
  useEffect(() => {
    if (nextUpNum == null || didJumpRef.current === meta.id) return;
    const idx = episodes.findIndex((ep) => ep.number === nextUpNum);
    if (idx < 12) return;
    didJumpRef.current = meta.id;
    if ((scrollRef.current?.scrollTop ?? 0) > 240) return;
    reveal(nextUpNum);
    scrollToDataEp(scrollRef.current, nextUpNum, { behavior: "auto", center: true });
  }, [nextUpNum, episodes, meta.id, reveal, scrollRef]);

  const isOneOff = meta.type === "movie" || episodes.length <= 1;
  return (
    <div data-anime-episodes className="flex flex-col gap-6 scroll-mt-24">
      <div className="flex items-center justify-between gap-6">
        <h3 className="text-[22px] font-medium tracking-tight text-ink">
          {isOneOff ? t("Movie") : t("Episodes")}
        </h3>
        <div className="flex items-center gap-4">
          {!isOneOff && (
            <p className="text-[13px] text-ink-subtle">
              {episodes.length === 1
                ? t("{n} episode", { n: episodes.length })
                : t("{n} episodes", { n: episodes.length })}
            </p>
          )}
          {!isOneOff && (
            <EpisodeLayoutToggle
              value={settings.episodeLayout}
              onChange={(v) => update({ episodeLayout: v })}
            />
          )}
          {!isOneOff && settings.episodeLayout === "grid" && (
            <EpisodeGridControls
              sort={settings.episodeSort}
              onSort={(s) => update({ episodeSort: s })}
              allWatched={allWatched}
              onMarkSeason={markSeason}
            />
          )}
          {franchise.length > 1 && (
            <AnimeSeasonPicker franchise={franchise} currentId={currentId} />
          )}
        </div>
      </div>
      {isOneOff ? (
        <MovieEntryCard meta={meta} ep={episodes[0]} watched={anilistCompleted} />
      ) : (
        <div key={settings.episodeLayout} className="animate-fade-in">
          {settings.episodeLayout === "list" ? (
            <div className="flex flex-col gap-1">
              {listEpisodes.map((ep) => (
                <AnimeEpisodeRow
                  key={ep.id}
                  meta={meta}
                  ep={ep}
                  progress={progressFor(ep)}
                  spoiler={spoilerFor(ep)}
                  onContextMenu={openWatchedMenu}
                />
              ))}
              {hasMore && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
            </div>
          ) : (
            <AnimeEpisodeStrip
              layout={settings.episodeLayout === "grid" ? "grid" : "strip"}
              meta={meta}
              episodes={settings.episodeLayout === "grid" ? episodes : listEpisodes}
              progressFor={progressFor}
              spoilerFor={spoilerFor}
              onContextMenu={openWatchedMenu}
              onReachEnd={settings.episodeLayout === "grid" ? undefined : grow}
            />
          )}
          <EpisodeJumper scrollRef={scrollRef} totalEpisodes={episodes.length} onReveal={reveal} />
        </div>
      )}
      {watchedMenu && (
        <EpisodeWatchedMenu
          metaId={meta.id}
          target={watchedMenu}
          onClose={() => setWatchedMenu(null)}
        />
      )}
    </div>
  );
}

function MovieEntryCard({
  meta,
  ep,
  watched = false,
}: {
  meta: Meta;
  ep: KitsuEpisode | undefined;
  watched?: boolean;
}) {
  const t = useT();
  const { openPicker } = useView();
  const { settings } = useSettings();
  const banner = meta.background || meta.poster;
  return (
    <button
      onClick={() =>
        openPicker(
          meta,
          ep
            ? {
                season: ep.seasonNumber || 1,
                episode: ep.number,
                name: ep.title,
                still: ep.thumbnail ?? undefined,
                overview: ep.synopsis || undefined,
                kitsuStreamId: ep.streamId,
                imdbId: ep.imdbId,
                imdbSeason: ep.imdbSeason,
                imdbEpisode: ep.imdbEpisode,
              }
            : { season: 1, episode: 1 },
          { autoPlay: settings.instantPlay },
        )
      }
      className="group relative block h-[300px] w-full overflow-hidden rounded-2xl border border-edge-soft/50 text-start"
    >
      {banner ? (
        <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-elevated" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas/90 via-canvas/35 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_8px_28px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:scale-105">
          <Play size={24} fill="currentColor" />
        </div>
      </div>
      <span className="absolute bottom-5 start-6 text-[15px] font-semibold text-ink drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {t("Play movie")}
      </span>
      {watched && (
        <span className="absolute end-4 top-4 flex items-center gap-1.5 rounded-full bg-emerald-400/22 px-2.5 py-1 text-[12px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
          <Check size={13} strokeWidth={3} />
          {t("Watched")}
        </span>
      )}
    </button>
  );
}

function AnimeSeasonPicker({
  franchise,
  currentId,
}: {
  franchise: FranchiseEntry[];
  currentId: string;
}) {
  const t = useT();
  const { openMeta } = useView();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const matchIdx = franchise.findIndex((f) => f.meta.id === currentId);
  const currentIdx = matchIdx >= 0 ? matchIdx : franchise.findIndex((f) => f.isCurrent);
  const current = franchise[currentIdx];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;
  const tags = franchiseTags(franchise);
  const positionLabel = tags[currentIdx]?.short ?? `S${currentIdx + 1}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-full border border-edge-soft bg-elevated/70 ps-4 pe-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-elevated"
      >
        <span className="font-mono text-[11.5px] text-ink-subtle">{positionLabel}</span>
        <span className="max-w-[280px] truncate">{current.meta.name}</span>
        {current.isUpcoming && <UpcomingBadge />}
        <ChevronDown
          size={15}
          className={`text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="animate-fade-in absolute end-0 top-full z-30 mt-2 w-[360px] max-w-[min(360px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-edge-soft bg-canvas py-1.5 shadow-2xl">
          <div className="max-h-[60vh] overflow-y-auto">
            {franchise.map((f, i) => {
              const isActive = i === currentIdx;
              return (
                <button
                  key={f.meta.id}
                  onClick={() => {
                    if (!isActive) openMeta(f.meta);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-start transition-colors ${
                    isActive ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                  }`}
                >
                  <span className="mt-0.5 font-mono text-[11px] text-ink-subtle">{tags[i]?.short ?? `S${i + 1}`}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium">
                      <span className="truncate">{f.meta.name}</span>
                      {f.isUpcoming && <UpcomingBadge />}
                    </span>
                    <span className="text-[11.5px] text-ink-subtle">
                      {f.episodeCount
                        ? f.episodeCount === 1
                          ? t("{n} ep", { n: f.episodeCount })
                          : t("{n} eps", { n: f.episodeCount })
                        : ""}
                      {f.episodeCount && f.startDate ? "  ·  " : ""}
                      {f.startDate ? f.startDate.slice(0, 4) : f.isUpcoming ? "TBA" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
