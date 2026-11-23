import { useT } from "@/lib/i18n";
import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { pickRandom } from "@/lib/feed/tags";
import { tmdbMovieImages } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useLocalizedOverview } from "@/lib/use-localized-overview";
import { useLiveImdbRating } from "@/lib/live-imdb";
import { ImdbIcon } from "../icons/imdb-icon";
import type { LightboxState } from "./types";

export function SidePanel({
  meta,
  activeIndex,
  total,
  onOpenLightbox,
}: {
  meta: Meta;
  activeIndex: number;
  total: number;
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

  const tiles = useMemo(() => {
    const sample = stills.length > 4 ? pickRandom(stills, 4, Date.now() ^ stills.length) : stills;
    return Array.from({ length: 4 }, (_, i) => sample[i] ?? fallbackBackdrop);
  }, [stills, fallbackBackdrop]);

  const lightboxImages = stills.length > 0
    ? stills
    : fallbackBackdrop
      ? [fallbackBackdrop]
      : [];

  const openAt = (tileSrc: string | undefined) => {
    if (!tileSrc || lightboxImages.length === 0) return;
    const startIndex = Math.max(0, lightboxImages.indexOf(tileSrc));
    onOpenLightbox({ images: lightboxImages, startIndex, title: meta.name });
  };

  return (
    <aside className="vayra-surface flex flex-col gap-3.5 self-stretch p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="line-clamp-2 font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-ink">
          {meta.name}
        </h4>
        <span className="shrink-0 rounded-full border border-edge-soft/75 bg-elevated/80 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums tracking-[0.12em] text-ink-subtle">
          {String(activeIndex + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((src, i) => (
          <Still
            key={`${meta.id}-${i}`}
            src={src}
            alt={meta.name}
            onClick={lightboxImages.length > 0 ? () => openAt(src) : undefined}
          />
        ))}
      </div>
      {description && (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {live.value && (
        <div className="mt-auto flex items-center gap-1.5 self-start rounded-full border border-edge-soft/75 bg-canvas/55 px-3 py-1 text-[12px] font-semibold tabular-nums text-ink">
          {live.isImdb ? (
            <ImdbIcon className="h-[12px] w-auto rounded-[2px]" />
          ) : (
            <Star className="h-[12px] w-[12px] text-info" fill="currentColor" strokeWidth={0} />
          )}
          <span>{live.value}</span>
          <span className="text-ink-subtle">{t("· Top Rated")}</span>
        </div>
      )}
    </aside>
  );
}

function Still({
  src,
  alt,
  onClick,
}: {
  src: string | undefined;
  alt: string;
  onClick?: () => void;
}) {
  if (!src) {
    return <div className="aspect-[16/9] rounded-md bg-elevated/45" />;
  }
  if (!onClick) {
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-edge-soft">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Expand ${alt} image`}
      className="group/still relative aspect-[16/9] overflow-hidden rounded-md border border-edge-soft transition-colors duration-200 hover:border-ink"
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover/still:scale-[1.04]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-canvas/0 transition-colors duration-200 group-hover/still:bg-canvas/20"
      />
    </button>
  );
}
