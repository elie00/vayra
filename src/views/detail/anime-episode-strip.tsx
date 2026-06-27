import { Check, Play, Eye } from "lucide-react";
import { useMemo } from "react";
import { MalLogo } from "@/components/icons/mal-logo";
import { DragStrip } from "@/components/drag-strip";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { useSettings } from "@/lib/settings";
import { SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { useView } from "@/lib/view";
import { formatAirDate } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { EpisodeGrid } from "./episode-grid";
import type { GridEpisode } from "./episode-grid-types";
import { FillerBadge, UpcomingBadge } from "./badges";
import { isUpcomingDate } from "./helpers";

type Progress = { ratio: number; watched: boolean; startedAt: number };

export function AnimeEpisodeStrip({
  meta,
  episodes,
  progressFor,
  spoilerFor,
  onContextMenu,
  layout = "strip",
  onReachEnd,
}: {
  meta: Meta;
  episodes: KitsuEpisode[];
  progressFor: (ep: KitsuEpisode) => Progress;
  spoilerFor?: (ep: KitsuEpisode) => SpoilerMask;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
  layout?: "strip" | "grid";
  onReachEnd?: () => void;
}) {
  const { openPicker } = useView();
  const { settings } = useSettings();
  const t = useT();

  const gridEpisodes = useMemo<GridEpisode[]>(
    () =>
      episodes.map((ep) => ({
        key: String(ep.id),
        number: ep.number,
        season: ep.seasonNumber || 1,
        title: ep.title || t("Episode {n}", { n: ep.number }),
        stills: [ep.thumbnail, ep.thumbnailFallback, meta.background].filter((u): u is string => !!u),
        runtime: ep.length,
        airDate: ep.airdate,
        overview: ep.synopsis || undefined,
        rating: Number(meta.imdbRating) || undefined,
        filler: ep.filler,
        upcoming: isUpcomingDate(ep.airdate),
        play: () =>
          openPicker(
            meta,
            {
              season: ep.seasonNumber || 1,
              episode: ep.number,
              name: ep.title,
              still: ep.thumbnail ?? undefined,
              overview: ep.synopsis || undefined,
              kitsuStreamId: ep.streamId,
              imdbId: ep.imdbId,
              imdbSeason: ep.imdbSeason,
              imdbEpisode: ep.imdbEpisode,
            },
            { autoPlay: settings.instantPlay },
          ),
      })),
    [episodes, meta, openPicker, settings.instantPlay, t],
  );
  const epByNumber = useMemo(() => {
    const m = new Map<number, KitsuEpisode>();
    for (const e of episodes) m.set(e.number, e);
    return m;
  }, [episodes]);

  if (layout === "grid") {
    return (
      <EpisodeGrid
        meta={meta}
        episodes={gridEpisodes}
        progressFor={(g) => progressFor(epByNumber.get(g.number)!)}
        spoilerFor={spoilerFor ? (g) => spoilerFor(epByNumber.get(g.number)!) : undefined}
        onContextMenu={onContextMenu}
      />
    );
  }
  return (
    <DragStrip itemCount={episodes.length} onReachEnd={onReachEnd}>
      {episodes.map((ep) => (
        <div key={ep.id} className="w-[244px] shrink-0">
          <AnimeEpisodeStripCard
            meta={meta}
            ep={ep}
            progress={progressFor(ep)}
            spoiler={spoilerFor?.(ep)}
            onContextMenu={onContextMenu}
          />
        </div>
      ))}
    </DragStrip>
  );
}

function AnimeEpisodeStripCard({
  meta,
  ep,
  progress,
  spoiler,
  onContextMenu,
}: {
  meta: Meta;
  ep: KitsuEpisode;
  progress: Progress;
  spoiler?: SpoilerMask;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
}) {
  const t = useT();
  const { openPicker, openEpisodeDetail } = useView();
  const { settings } = useSettings();
  const upcoming = isUpcomingDate(ep.airdate);

  const handlePlayClick = () => {
    openPicker(
      meta,
      {
        season: ep.seasonNumber || 1,
        episode: ep.number,
        name: ep.title,
        still: ep.thumbnail ?? undefined,
        overview: ep.synopsis || undefined,
        kitsuStreamId: ep.streamId,
        imdbId: ep.imdbId,
        imdbSeason: ep.imdbSeason,
        imdbEpisode: ep.imdbEpisode,
      },
      { autoPlay: settings.instantPlay },
    );
  };

  return (
    <div
      data-ep={ep.number}
      data-no-card-ring
      onContextMenu={(e) => onContextMenu?.(e, ep.seasonNumber || 1, ep.number, progress.watched)}
      className="group flex w-full flex-col gap-2.5 text-start"
    >
      <button
        type="button"
        onClick={handlePlayClick}
        className="relative aspect-video overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <div className={`${spoiler?.thumb ? SPOILER_THUMB_CLASS : ""} ${upcoming ? "opacity-55 saturate-50" : ""}`}>
          <Poster src={ep.thumbnail ?? undefined} seed={String(ep.id)} ratio="landscape" className="" lazy fallbacks={[ep.thumbnailFallback, meta.background]} />
        </div>
        {upcoming && (
          <span className="absolute bottom-2 start-2 transition-opacity group-hover:opacity-0">
            <UpcomingBadge />
          </span>
        )}

        {/* Persistent bottom gradient with Synopsis */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-12 text-start pointer-events-none">
          {settings.showEpisodeRating && meta.imdbRating ? (
            <div className="mb-1 flex items-center gap-1.5 drop-shadow-md">
              <MalLogo className="h-2.5 w-auto text-white shadow-sm" />
              <span className="text-[10px] font-bold text-white">
                {meta.imdbRating}
              </span>
            </div>
          ) : null}
          {ep.synopsis && (
            <p className="line-clamp-4 text-[9.5px] leading-[1.35] text-white/95 drop-shadow-md">
              {ep.synopsis}
            </p>
          )}
        </div>

        {/* Hover Play Button */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/90 text-canvas backdrop-blur-md">
            <Play size={16} fill="currentColor" />
          </div>
        </div>

        <span className="absolute start-2 top-2 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink transition-opacity group-hover:opacity-0">
          {ep.number}
        </span>
        {progress.watched && (
          <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm transition-opacity group-hover:opacity-0">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {progress.ratio > 0.01 && (
          <div className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-black/55 transition-opacity group-hover:opacity-0">
            <div className="h-full bg-accent" style={{ width: `${Math.max(2, progress.ratio * 100)}%` }} />
          </div>
        )}
      </button>
      <div className="flex items-start justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={handlePlayClick}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-start focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            <span className={`truncate text-[13.5px] font-semibold text-ink ${spoiler?.title ? SPOILER_TEXT_CLASS : ""}`}>
              {ep.title || t("Episode {n}", { n: ep.number })}
            </span>
            {ep.filler && <FillerBadge />}
          </span>
          <span className="text-[11.5px] text-ink-subtle">
            E{ep.number}
            {ep.length ? ` · ${t("{n} min", { n: ep.length })}` : ""}
            {upcoming && ep.airdate ? ` · ${formatAirDate(ep.airdate)}` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => openEpisodeDetail(meta.id, ep.seasonNumber || 1, ep.number, meta)}
          aria-label={t("Episode details")}
          title={t("Episode details")}
          className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-ink-subtle transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <Eye size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
