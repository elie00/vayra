import { Check, Heart, Play } from "lucide-react";
import { useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { markMovieWatched } from "@/lib/mark-watched";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { useT } from "@/lib/i18n";

export function ElegantHoverActions({ meta, onPlay }: { meta: Meta; onPlay: () => void }) {
  const t = useT();
  const inWatchlist = useInWatchlist(meta.id);
  const [watched, setWatched] = useState(false);
  const movie = meta.type === "movie";
  const act = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-between rounded-[var(--poster-radius,12px)] bg-black/25 p-2.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <span
        role="button"
        aria-label={t("Play")}
        title={t("Play")}
        onClick={(e) => act(e, onPlay)}
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#22a45d] text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7)] transition-transform hover:scale-110"
      >
        <Play size={17} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
      </span>
      <span className="flex items-center gap-0.5">
        {movie && (
          <span
            role="button"
            aria-label={t("Mark watched")}
            title={t("Mark watched")}
            onClick={(e) =>
              act(e, () => {
                setWatched(true);
                void markMovieWatched(
                  meta,
                  meta.id.startsWith("tt") ? meta.id : null,
                  meta.id.startsWith("tmdb:") ? meta.id.split(":")[2] : null,
                );
              })
            }
            className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
              watched ? "text-emerald-400" : "text-white"
            }`}
          >
            <Check size={19} strokeWidth={2.8} />
          </span>
        )}
        <span
          role="button"
          aria-label={inWatchlist ? t("Remove from watchlist") : t("Add to watchlist")}
          title={inWatchlist ? t("Remove from watchlist") : t("Add to watchlist")}
          onClick={(e) =>
            act(e, () => {
              toggleWatchlist({ id: meta.id, type: meta.type, name: meta.name, poster: meta.poster });
            })
          }
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:scale-110"
        >
          <Heart size={17} strokeWidth={2.2} fill={inWatchlist ? "currentColor" : "none"} />
        </span>
      </span>
    </div>
  );
}
