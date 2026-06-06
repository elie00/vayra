import { Check, ChevronDown, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EpisodeJumper } from "@/components/episode-jumper";
import { EpisodeWatchedMenu, type WatchedMenuTarget } from "@/components/episode-watched-menu";
import { manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { formatAirDate } from "@/lib/dates";
import { formatRelativeWatched, getEpisodeProgress, resumeDefaultSeason } from "@/lib/episode-progress";
import { getLastSeason, setLastSeason } from "@/lib/last-season";
import {
  tmdbSeasonEpisodes,
  type Episode,
  type Season,
} from "@/lib/providers/tmdb";
import { tvdbEpisodes, tvdbSeriesByImdb, type TvdbEpisode } from "@/lib/providers/tvdb";
import { useSettings } from "@/lib/settings";
import { fetchWatchedKeySet } from "@/lib/trakt/history";
import { useTrakt } from "@/lib/trakt/provider";
import { useView } from "@/lib/view";
import { NewBadge, UpcomingBadge } from "./badges";
import { CinemetaEpisodeRow } from "./cinemeta-episodes";
import { EpisodeLayoutToggle } from "./episode-layout-toggle";
import { EpisodeStrip } from "./episode-strip";
import { isNewEpisode, isNewSeason, isUpcomingEpisode } from "./helpers";

export function SeriesEpisodes({
  meta,
  tvId,
  imdbId,
  seasons,
  lastEpisodeAir,
  scrollRef,
  cinemetaVideos,
  stremioWatched,
}: {
  meta: Meta;
  tvId: number;
  imdbId: string | null;
  seasons: Season[];
  lastEpisodeAir?: { seasonNumber: number; airDate: string | null };
  scrollRef: React.RefObject<HTMLElement | null>;
  cinemetaVideos?: NonNullable<Meta["videos"]>;
  stremioWatched?: Set<string>;
}) {
  const { settings, update } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);
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
  const userPickedRef = useRef(false);
  const autoSeasonRef = useRef(false);
  const [active, setActive] = useState<number>(() => {
    const saved = getLastSeason(meta.id);
    if (saved != null && seasons.some((s) => s.seasonNumber === saved)) return saved;
    return resumeDefaultSeason(meta.id, seasons, stremioWatched);
  });
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [tvdbBySeason, setTvdbBySeason] = useState<Map<number, Map<number, TvdbEpisode>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [traktWatched, setTraktWatched] = useState<Set<string>>(() => new Set());
  const cache = useRef<Map<number, Episode[]>>(new Map());

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

  const traktKey = imdbId ?? meta.id;

  useEffect(() => {
    userPickedRef.current = false;
    autoSeasonRef.current = false;
  }, [meta.id]);

  useEffect(() => {
    if (userPickedRef.current) return;
    const saved = getLastSeason(meta.id);
    if (saved != null && seasons.some((s) => s.seasonNumber === saved)) {
      autoSeasonRef.current = true;
      setActive(saved);
    }
  }, [meta.id, seasons]);

  useEffect(() => {
    if (userPickedRef.current || autoSeasonRef.current) return;
    if (!stremioWatched || stremioWatched.size === 0) return;
    autoSeasonRef.current = true;
    setActive(resumeDefaultSeason(meta.id, seasons, stremioWatched));
  }, [stremioWatched, seasons, meta.id]);

  useEffect(() => {
    let cancelled = false;
    const cached = cache.current.get(active);
    if (cached) {
      setEpisodes(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    tmdbSeasonEpisodes(settings.tmdbKey, tvId, active).then((eps) => {
      if (cancelled) return;
      if (eps.length > 0) {
        const m = cache.current;
        m.delete(active);
        m.set(active, eps);
        while (m.size > 2) {
          const oldest = m.keys().next().value;
          if (oldest === undefined) break;
          m.delete(oldest);
        }
      }
      setEpisodes(eps);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tvId, active, settings.tmdbKey]);

  useEffect(() => {
    if (!settings.tvdbKey || !imdbId) return;
    if (tvdbBySeason.has(active)) return;
    let cancelled = false;
    (async () => {
      const seriesId = await tvdbSeriesByImdb(settings.tvdbKey, imdbId);
      if (!seriesId || cancelled) return;
      const eps = await tvdbEpisodes(settings.tvdbKey, seriesId, active);
      if (cancelled) return;
      const map = new Map<number, TvdbEpisode>();
      for (const e of eps) map.set(e.number, e);
      setTvdbBySeason((prev) => {
        const next = new Map(prev);
        next.set(active, map);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [imdbId, active, settings.tvdbKey, tvdbBySeason]);

  const tvdbForSeason = tvdbBySeason.get(active);
  const enrichedEpisodes = useMemo<Episode[]>(() => {
    if (!tvdbForSeason) return episodes;
    return episodes.map((ep): Episode => {
      const t = tvdbForSeason.get(ep.episodeNumber);
      if (!t) return ep;
      const overview =
        t.overview && t.overview.trim().length > (ep.overview?.trim().length ?? 0)
          ? t.overview
          : ep.overview;
      return {
        ...ep,
        overview,
        runtime: ep.runtime ?? t.runtime ?? null,
        name: ep.name || t.name || ep.name,
        airDate: ep.airDate ?? t.aired ?? null,
      };
    });
  }, [episodes, tvdbForSeason]);

  const activeSeason = seasons.find((s) => s.seasonNumber === active);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <h3 className="text-[22px] font-medium tracking-tight text-ink">Episodes</h3>
        <div className="flex items-center gap-2.5">
          <EpisodeLayoutToggle
            value={settings.episodeLayout}
            onChange={(v) => update({ episodeLayout: v })}
          />
          {seasons.length > 1 && (
            <SeasonPicker
              seasons={seasons}
              active={active}
              onChange={(n) => {
                userPickedRef.current = true;
                setLastSeason(meta.id, n);
                setActive(n);
              }}
              lastEpisodeAir={lastEpisodeAir}
            />
          )}
        </div>
      </div>

      {activeSeason && (activeSeason.airDate || activeSeason.episodeCount > 0) && (
        <p className="text-[13px] text-ink-subtle">
          {activeSeason.episodeCount} episode{activeSeason.episodeCount === 1 ? "" : "s"}
          {activeSeason.airDate && ` · ${activeSeason.airDate.slice(0, 4)}`}
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-edge-soft bg-elevated/30" />
          ))}
        </div>
      )}

      {!loading && enrichedEpisodes.length === 0 && (
        <CinemetaFallback meta={meta} videos={cinemetaVideos} season={active} />
      )}

      {!loading && enrichedEpisodes.length > 0 && settings.episodeLayout === "strip" && (
        <EpisodeStrip
          meta={meta}
          episodes={enrichedEpisodes}
          progressFor={(ep) =>
            getEpisodeProgress(
              meta.id,
              ep.seasonNumber,
              ep.episodeNumber,
              ep.runtime,
              traktKey,
              traktWatched,
              stremioWatched,
            )
          }
          thumbnailFor={(ep) =>
            cinemetaVideos?.find(
              (v) => v.season === ep.seasonNumber && v.episode === ep.episodeNumber,
            )?.thumbnail
          }
          onContextMenu={openWatchedMenu}
        />
      )}

      {!loading && enrichedEpisodes.length > 0 && settings.episodeLayout !== "strip" && (
        <div className="flex flex-col gap-1">
          {enrichedEpisodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              meta={meta}
              ep={ep}
              cinemetaThumbnail={
                cinemetaVideos?.find(
                  (v) => v.season === ep.seasonNumber && v.episode === ep.episodeNumber,
                )?.thumbnail
              }
              progress={getEpisodeProgress(
                meta.id,
                ep.seasonNumber,
                ep.episodeNumber,
                ep.runtime,
                traktKey,
                traktWatched,
                stremioWatched,
              )}
              onContextMenu={openWatchedMenu}
            />
          ))}
        </div>
      )}
      {settings.episodeLayout !== "strip" && (
        <EpisodeJumper scrollRef={scrollRef} totalEpisodes={enrichedEpisodes.length} />
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

function EpisodeRow({
  meta,
  ep,
  progress,
  cinemetaThumbnail,
  onContextMenu,
}: {
  meta: Meta;
  ep: Episode;
  progress: { ratio: number; watched: boolean; startedAt: number };
  cinemetaThumbnail?: string;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
}) {
  const { openPicker } = useView();
  const { settings } = useSettings();
  const tmdbStill = ep.stillPath ? `https://image.tmdb.org/t/p/w300${ep.stillPath}` : undefined;
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [tmdbStill, cinemetaThumbnail]) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }, [tmdbStill, cinemetaThumbnail]);
  const [imgIdx, setImgIdx] = useState(0);
  useEffect(() => {
    setImgIdx(0);
  }, [ep.id]);
  const still = candidates[imgIdx];
  const watchedAgo = progress.startedAt > 0 ? formatRelativeWatched(progress.startedAt) : "";
  return (
    <button
      data-ep={ep.episodeNumber}
      data-no-card-ring
      onContextMenu={(e) => onContextMenu?.(e, ep.seasonNumber, ep.episodeNumber, progress.watched)}
      onClick={() =>
        openPicker(
          meta,
          {
            season: ep.seasonNumber,
            episode: ep.episodeNumber,
            name: ep.name || undefined,
            still: still,
            overview: ep.overview || undefined,
          },
          { autoPlay: settings.instantPlay },
        )
      }
      className="group flex gap-6 rounded-2xl px-4 py-5 text-left transition-colors hover:bg-elevated/30"
    >
      <div className="relative w-[200px] shrink-0 overflow-hidden rounded-lg">
        <Poster
          src={still}
          seed={String(ep.id)}
          ratio="landscape"
          className=""
          onError={() => setImgIdx((i) => i + 1)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-canvas/40 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-canvas">
            <Play size={18} fill="currentColor" />
          </div>
        </div>
        <span className="absolute left-2 top-2 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
          {ep.episodeNumber}
        </span>
        {progress.watched && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {progress.ratio > 0.01 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h4 className="flex items-center gap-2 truncate text-[16px] font-semibold text-ink">
          <span className="truncate">{ep.name || `Episode ${ep.episodeNumber}`}</span>
          {isUpcomingEpisode(ep) ? <UpcomingBadge /> : isNewEpisode(ep) && <NewBadge />}
        </h4>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-subtle">
          <span>
            {[
              `S${ep.seasonNumber} E${ep.episodeNumber}`,
              ep.runtime ? `${ep.runtime} min` : null,
              formatAirDate(ep.airDate) || null,
              ep.voteAverage && ep.voteAverage > 0 ? `★ ${ep.voteAverage.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </span>
          {progress.watched && watchedAgo && (
            <span className="text-emerald-300/85">· Watched {watchedAgo}</span>
          )}
          {!progress.watched && progress.ratio > 0.01 && watchedAgo && (
            <span className="text-accent/85">
              · {Math.round(progress.ratio * 100)}% watched · {watchedAgo}
            </span>
          )}
        </p>
        {ep.overview && (
          <p className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted">{ep.overview}</p>
        )}
      </div>
    </button>
  );
}

function SeasonPicker({
  seasons,
  active,
  onChange,
  lastEpisodeAir,
}: {
  seasons: Season[];
  active: number;
  onChange: (n: number) => void;
  lastEpisodeAir?: { seasonNumber: number; airDate: string | null };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = seasons.find((s) => s.seasonNumber === active);
  const isNew = (s: Season) => isNewSeason(s, lastEpisodeAir);
  const hasUnseenNew =
    !open &&
    seasons.some((s) => isNew(s) && s.seasonNumber !== active);

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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 items-center gap-2 rounded-full border border-edge-soft bg-canvas/90 pl-4 pr-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-canvas/100"
      >
        <span>{current?.name ?? `Season ${active}`}</span>
        {current && isNew(current) && <NewBadge />}
        <ChevronDown
          size={15}
          className={`text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {hasUnseenNew && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas" />
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-edge-soft bg-canvas py-1.5 shadow-2xl">
          <div className="max-h-[60vh] overflow-y-auto">
            {seasons.map((s) => {
              const isActive = s.seasonNumber === active;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    onChange(s.seasonNumber);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium">
                      <span className="truncate">{s.name}</span>
                      {isNew(s) && <NewBadge />}
                    </span>
                    <span className="text-[11.5px] text-ink-subtle">
                      {s.episodeCount} episode{s.episodeCount === 1 ? "" : "s"}
                      {s.airDate && ` · ${s.airDate.slice(0, 4)}`}
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

function CinemetaFallback({
  meta,
  videos,
  season,
}: {
  meta: Meta;
  videos: NonNullable<Meta["videos"]> | undefined;
  season: number;
}) {
  const eps = useMemo(() => {
    if (!videos) return [];
    return videos
      .filter((v) => v.season === season && v.episode != null)
      .slice()
      .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
  }, [videos, season]);
  if (eps.length === 0) {
    return <p className="text-[14px] text-ink-subtle">No episodes available for this season.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {eps.map((ep) => (
        <CinemetaEpisodeRow key={ep.id ?? `${ep.season}-${ep.episode}`} meta={meta} ep={ep} />
      ))}
    </div>
  );
}
