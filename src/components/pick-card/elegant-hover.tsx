import { Check, Heart, Play } from "lucide-react";
import { useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { markMovieWatched } from "@/lib/mark-watched";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { useT } from "@/lib/i18n";
import { HoverAction } from "./hover-action";

export function ElegantHoverActions({
  meta,
  onPlay,
  preview,
}: {
  meta: Meta;
  onPlay: () => void;
  preview?: boolean;
}) {
  const t = useT();
  const inWatchlist = useInWatchlist(meta.id);
  const [watched, setWatched] = useState(false);
  const movie = meta.type === "movie";
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex items-end justify-between rounded-[var(--poster-radius,12px)] bg-black/25 p-2.5 transition-opacity duration-150 ${
        preview ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
    >
      <HoverAction
        label={t("Play")}
        onActivate={onPlay}
        preview={preview}
        className={`flex h-11 w-11 items-center justify-center rounded-full bg-[#22a45d] text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7)] transition-transform hover:scale-110`}
      >
        <Play size={17} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
      </HoverAction>
      <span className="flex items-center gap-0.5">
        {movie && (
          <HoverAction
            label={t("Mark watched")}
            onActivate={() => {
              setWatched(true);
              void markMovieWatched(
                meta,
                meta.id.startsWith("tt") ? meta.id : null,
                meta.id.startsWith("tmdb:") ? meta.id.split(":")[2] : null,
              );
            }}
            preview={preview}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
              watched ? "text-emerald-400" : "text-white"
            }`}
          >
            <Check size={19} strokeWidth={2.8} />
          </HoverAction>
        )}
        <HoverAction
          label={inWatchlist ? t("Remove from watchlist") : t("Add to watchlist")}
          onActivate={() => toggleWatchlist({ id: meta.id, type: meta.type, name: meta.name, poster: meta.poster })}
          preview={preview}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:scale-110`}
        >
          <Heart size={17} strokeWidth={2.2} fill={inWatchlist ? "currentColor" : "none"} />
        </HoverAction>
      </span>
    </div>
  );
}
