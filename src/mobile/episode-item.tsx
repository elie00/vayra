import { useState, type ReactNode } from "react";
import { Check, Play } from "lucide-react";
import { Poster } from "@/components/poster";
import { useT } from "@/lib/i18n";

/**
 * One episode on a phone, as Netflix and HBO list them: a still over 40% of the
 * width with the number, title and runtime beside it, then the synopsis across
 * the full width, three lines that open on a tap. A fixed 200px still left the
 * text a narrow column, and the synopsis was not shown at all.
 */
export function MobileEpisodeItem({
  number,
  title,
  facts,
  synopsis,
  still,
  seed,
  progress = 0,
  watched = false,
  onPlay,
  onStillError,
  trailing,
}: {
  number: number;
  title: string;
  facts: string[];
  synopsis?: string;
  still?: string;
  seed: string;
  progress?: number;
  watched?: boolean;
  onPlay: () => void;
  onStillError?: () => void;
  /** e.g. a download button, beside the title. */
  trailing?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-2.5 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlay}
          aria-label={t("Play {title}", { title })}
          className="group relative aspect-video w-[40%] shrink-0 overflow-hidden rounded-lg bg-elevated transition-transform active:scale-[0.97]"
        >
          <Poster src={still} seed={seed} ratio="landscape" lazy onError={onStillError} />
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm">
              <Play size={15} fill="currentColor" className="ms-0.5" />
            </span>
          </span>
          {watched && (
            <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
          {progress > 0.01 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
              <span className="block h-full bg-accent" style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 type-callout font-semibold text-ink" dir="auto">
            {number}. {title}
          </p>
          {facts.length > 0 && <p className="type-caption text-ink-subtle">{facts.join("  ·  ")}</p>}
        </div>
        {trailing}
      </div>
      {synopsis && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`text-start type-footnote leading-relaxed text-ink-muted ${open ? "" : "line-clamp-3"}`}
          dir="auto"
        >
          {synopsis}
        </button>
      )}
    </li>
  );
}
