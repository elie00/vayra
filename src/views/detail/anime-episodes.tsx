import { Check, ChevronDown, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EpisodeJumper } from "@/components/episode-jumper";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { formatAirDate } from "@/lib/dates";
import { formatRelativeWatched, getEpisodeProgress } from "@/lib/episode-progress";
import { franchiseTags, type FranchiseEntry } from "@/lib/providers/anime-detail";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { useSettings } from "@/lib/settings";
import { spoilerMaskFor, SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { fetchWatchedKeySet } from "@/lib/trakt/history";
import { useTrakt } from "@/lib/trakt/provider";
import { useView } from "@/lib/view";
import { useAnilistWatched } from "@/lib/anilist/use-anilist-watched";
import { EpisodeWatchedMenu, type WatchedMenuTarget } from "@/components/episode-watched-menu";
import { manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { useT } from "@/lib/i18n";
import { AnimeEpisodeStrip } from "./anime-episode-strip";
import { FillerBadge, UpcomingBadge } from "./badges";
import { EpisodeDownloadButton } from "./episode-download-button";
import { EpisodeLayoutToggle } from "./episode-layout-toggle";
import { isUpcomingDate } from "./helpers";

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
          {franchise.length > 1 && (
            <AnimeSeasonPicker franchise={franchise} currentId={currentId} />
          )}
        </div>
      </div>
      {isOneOff ? (
        <MovieEntryCard meta={meta} ep={episodes[0]} watched={anilistCompleted} />
      ) : settings.episodeLayout === "list" ? (
        <>
          <div className="flex flex-col gap-1">
            {episodes.map((ep) => (
              <AnimeEpisodeRow
                key={ep.id}
                meta={meta}
                ep={ep}
                progress={progressFor(ep)}
                spoiler={spoilerFor(ep)}
                onContextMenu={openWatchedMenu}
              />
            ))}
          </div>
          <EpisodeJumper scrollRef={scrollRef} totalEpisodes={episodes.length} />
        </>
      ) : (
        <>
          <AnimeEpisodeStrip
            layout={settings.episodeLayout === "grid" ? "grid" : "strip"}
            meta={meta}
            episodes={episodes}
            progressFor={progressFor}
            spoilerFor={spoilerFor}
            onContextMenu={openWatchedMenu}
          />
          {settings.episodeLayout === "grid" && (
            <EpisodeJumper scrollRef={scrollRef} totalEpisodes={episodes.length} />
          )}
        </>
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

function AnimeEpisodeRow({
  meta,
  ep,
  progress,
  spoiler,
  onContextMenu,
}: {
  meta: Meta;
  ep: KitsuEpisode;
  progress: { ratio: number; watched: boolean; startedAt: number };
  spoiler?: SpoilerMask;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
}) {
  const t = useT();
  const { openPicker } = useView();
  const { settings } = useSettings();
  const watchedAgo = progress.startedAt > 0 ? formatRelativeWatched(progress.startedAt) : "";
  const playEpisode = {
    season: ep.seasonNumber || 1,
    episode: ep.number,
    name: ep.title,
    still: ep.thumbnail ?? undefined,
    overview: ep.synopsis || undefined,
    kitsuStreamId: ep.streamId,
    imdbId: ep.imdbId,
    imdbSeason: ep.imdbSeason,
    imdbEpisode: ep.imdbEpisode,
  };
  return (
    <div
      data-ep={ep.number}
      data-no-card-ring
      onContextMenu={(e) => onContextMenu?.(e, ep.seasonNumber || 1, ep.number, progress.watched)}
      className="group flex gap-6 rounded-2xl px-4 py-5 transition-colors hover:bg-elevated/30"
    >
      <button
        onClick={() => openPicker(meta, playEpisode, { autoPlay: settings.instantPlay })}
        className="flex min-w-0 flex-1 gap-6 text-start"
      >
        <div className="relative w-[200px] shrink-0">
          <div className={spoiler?.thumb ? `overflow-hidden rounded-lg ${SPOILER_THUMB_CLASS}` : undefined}>
            <Poster
              src={ep.thumbnail ?? undefined}
              seed={String(ep.id)}
              ratio="landscape"
              className="rounded-lg"
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-canvas/40 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-canvas">
              <Play size={18} fill="currentColor" />
            </div>
          </div>
          <span className="absolute start-2 top-2 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
            {ep.number}
          </span>
          {progress.watched && (
            <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
          {progress.ratio > 0.01 && (
            <div className="absolute inset-x-1 bottom-1 h-[3px] overflow-hidden rounded-full bg-black/55">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h4 className="flex items-center gap-2 truncate text-[16px] font-semibold text-ink">
            <span className={`truncate ${spoiler?.title ? SPOILER_TEXT_CLASS : ""}`}>
              {ep.title || t("Episode {n}", { n: ep.number })}
            </span>
            {ep.filler && <FillerBadge />}
            {isUpcomingDate(ep.airdate) ? <UpcomingBadge /> : null}
          </h4>
          <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-subtle">
            <span>
              {[
                `E${ep.number}`,
                ep.absoluteNumber && ep.absoluteNumber !== ep.number ? `Abs E${ep.absoluteNumber}` : null,
                ep.length ? t("{n} min", { n: ep.length }) : null,
                formatAirDate(ep.airdate) || null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </span>
            {progress.watched && watchedAgo && (
              <span className="text-emerald-300/85">· {t("Watched {ago}", { ago: watchedAgo })}</span>
            )}
            {!progress.watched && progress.ratio > 0.01 && watchedAgo && (
              <span className="text-accent/85">
                · {t("{pct}% watched", { pct: Math.round(progress.ratio * 100) })} · {watchedAgo}
              </span>
            )}
          </p>
          {ep.synopsis && (
            <p
              className={`line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted ${
                spoiler?.desc ? SPOILER_TEXT_CLASS : ""
              }`}
            >
              {ep.synopsis}
            </p>
          )}
        </div>
      </button>
      <EpisodeDownloadButton meta={meta} episode={playEpisode} />
    </div>
  );
}

