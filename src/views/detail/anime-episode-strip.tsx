import { Check, Play } from "lucide-react";
import { DragStrip } from "@/components/drag-strip";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { useSettings } from "@/lib/settings";
import { SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { useView } from "@/lib/view";
import { formatAirDate } from "@/lib/dates";
import { useT } from "@/lib/i18n";
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
}: {
  meta: Meta;
  episodes: KitsuEpisode[];
  progressFor: (ep: KitsuEpisode) => Progress;
  spoilerFor?: (ep: KitsuEpisode) => SpoilerMask;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
  layout?: "strip" | "grid";
}) {
  if (layout === "grid") {
    return (
      <div className="grid gap-x-4 gap-y-5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {episodes.map((ep) => (
          <AnimeEpisodeStripCard
            key={ep.id}
            grid
            meta={meta}
            ep={ep}
            progress={progressFor(ep)}
            spoiler={spoilerFor?.(ep)}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    );
  }
  return (
    <DragStrip itemCount={episodes.length}>
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
  grid = false,
}: {
  meta: Meta;
  ep: KitsuEpisode;
  progress: Progress;
  spoiler?: SpoilerMask;
  onContextMenu?: (e: React.MouseEvent, season: number, episode: number, watched: boolean) => void;
  grid?: boolean;
}) {
  const t = useT();
  const { openPicker } = useView();
  const { settings } = useSettings();
  const upcoming = isUpcomingDate(ep.airdate);
  return (
    <button
      data-ep={ep.number}
      data-no-card-ring
      onContextMenu={(e) => onContextMenu?.(e, ep.seasonNumber || 1, ep.number, progress.watched)}
      onClick={() =>
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
        )
      }
      className="group flex w-full flex-col gap-2.5 text-start"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl">
        <div className={`${spoiler?.thumb ? SPOILER_THUMB_CLASS : ""} ${upcoming ? "opacity-55 saturate-50" : ""}`}>
          <Poster src={ep.thumbnail ?? undefined} seed={String(ep.id)} ratio="landscape" className="" />
        </div>
        {upcoming && (
          <span className="absolute bottom-2 start-2">
            <UpcomingBadge />
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-canvas/40 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-canvas">
            <Play size={16} fill="currentColor" />
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
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div className="h-full bg-accent" style={{ width: `${Math.max(2, progress.ratio * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="flex items-center gap-2">
          <span className={`${grid ? "line-clamp-2" : "truncate"} text-[13.5px] font-semibold text-ink ${spoiler?.title ? SPOILER_TEXT_CLASS : ""}`}>
            {ep.title || t("Episode {n}", { n: ep.number })}
          </span>
          {ep.filler && <FillerBadge />}
        </span>
        <span className="text-[11.5px] text-ink-subtle">
          E{ep.number}
          {ep.length ? ` · ${t("{n} min", { n: ep.length })}` : ""}
          {upcoming && ep.airdate ? ` · ${formatAirDate(ep.airdate)}` : ""}
        </span>
      </div>
    </button>
  );
}
