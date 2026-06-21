import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Season } from "@/lib/providers/tmdb";
import { NewBadge } from "../badges";
import { isNewSeason } from "../helpers";

export function SeasonPicker({
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = seasons.find((s) => s.seasonNumber === active);
  const isNew = (s: Season) => isNewSeason(s, lastEpisodeAir);
  const hasUnseenNew = !open && seasons.some((s) => isNew(s) && s.seasonNumber !== active);

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
        className="relative flex h-10 items-center gap-2 rounded-full border border-edge-soft bg-canvas/90 ps-4 pe-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-canvas/100"
      >
        <span>{current?.name ?? t("Season {n}", { n: active })}</span>
        {current && isNew(current) && <NewBadge />}
        <ChevronDown
          size={15}
          className={`text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {hasUnseenNew && (
          <span className="pointer-events-none absolute -end-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas" />
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-in absolute end-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-edge-soft bg-canvas py-1.5 shadow-2xl">
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
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors ${
                    isActive ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium">
                      <span className="truncate">{s.name}</span>
                      {isNew(s) && <NewBadge />}
                    </span>
                    <span className="text-[11.5px] text-ink-subtle">
                      {s.episodeCount === 1
                        ? t("{n} episode", { n: s.episodeCount })
                        : t("{n} episodes", { n: s.episodeCount })}
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
