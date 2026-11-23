import { useT } from "@/lib/i18n";
import { Images, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { tmdbMovieImages } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useLocalizedOverview } from "@/lib/use-localized-overview";
import { useLiveImdbRating } from "@/lib/live-imdb";
import { ImdbIcon } from "../icons/imdb-icon";
import type { LightboxState } from "./types";

export function SidePanel({
  items,
  meta,
  activeIndex,
  onSelect,
  onOpenLightbox,
}: {
  items: Meta[];
  meta: Meta;
  activeIndex: number;
  onSelect: (index: number) => void;
  onOpenLightbox: (state: LightboxState) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [stills, setStills] = useState<string[]>([]);
  const description = useLocalizedOverview(meta);
  const live = useLiveImdbRating(meta);

  useEffect(() => {
    if (!settings.tmdbKey) {
      setStills([]);
      return;
    }
    let cancelled = false;
    tmdbMovieImages(settings.tmdbKey, meta.id)
      .then((urls) => {
        if (cancelled) return;
        setStills(urls);
      })
      .catch(() => {
        if (cancelled) return;
        setStills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.id, settings.tmdbKey]);

  const fallbackBackdrop = meta.background ?? meta.poster;
  const lightboxImages = stills.length > 0
    ? stills
    : fallbackBackdrop
      ? [fallbackBackdrop]
      : [];

  return (
    <aside className="vayra-surface flex flex-col gap-4 self-stretch p-4 sm:p-5">
      <div className="flex flex-col gap-2.5 border-b border-edge-soft/65 pb-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <h4 className="line-clamp-2 font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            {meta.name}
          </h4>
          {live.value && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-edge-soft/75 bg-canvas/65 px-2.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-ink">
              {live.isImdb ? (
                <ImdbIcon className="h-[11px] w-auto rounded-[2px]" />
              ) : (
                <Star className="h-[11px] w-[11px] text-info" fill="currentColor" strokeWidth={0} />
              )}
              <span>{live.value}</span>
            </div>
          )}
        </div>

        {description && (
          <p className="line-clamp-3 text-[12.5px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}

        {lightboxImages.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenLightbox({ images: lightboxImages, startIndex: 0, title: meta.name })}
            className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-full border border-edge-soft/75 bg-canvas/50 px-3 py-1 text-[11.5px] font-medium text-ink-muted transition-[border-color,background-color,color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink"
          >
            <Images size={12} strokeWidth={2} aria-hidden="true" />
            <span>{t("View stills")}</span>
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="vayra-kicker">{t("In this selection")}</span>
          <span className="text-[11px] font-semibold tabular-nums text-ink-subtle">
            {String(activeIndex + 1).padStart(2, "0")}/{String(items.length).padStart(2, "0")}
          </span>
        </div>

        <div className="flex max-h-[248px] flex-col gap-1.5 overflow-y-auto pe-0.5">
          {items.map((item, idx) => {
            const isActive = idx === activeIndex;
            const thumb = item.background ?? item.poster;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(idx)}
                className={`group flex w-full items-center gap-2.5 rounded-xl border p-1.5 text-start transition-[border-color,background-color,color] duration-150 ${
                  isActive
                    ? "border-accent/55 bg-elevated/95 text-ink shadow-[0_6px_18px_-14px_rgba(0,0,0,0.75)]"
                    : "border-transparent bg-transparent text-ink-muted hover:border-edge-soft/75 hover:bg-elevated/55 hover:text-ink"
                }`}
              >
                <div className="relative h-10 w-[72px] shrink-0 overflow-hidden rounded-lg bg-canvas">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-elevated/70" />
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[2.5px] bg-accent"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`truncate text-[12.5px] leading-snug ${isActive ? "font-semibold text-ink" : "font-medium text-ink-muted group-hover:text-ink"}`}>
                    {item.name}
                  </span>
                  {item.releaseInfo && (
                    <span className="truncate text-[11px] tabular-nums text-ink-subtle">
                      {item.releaseInfo}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
