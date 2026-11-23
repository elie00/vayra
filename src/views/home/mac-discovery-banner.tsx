import { useState } from "react";
import { ChevronLeft, ChevronRight, Compass, Play, Star } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import type { Meta } from "@/lib/cinemeta";

export function MacDiscoveryBanner({
  meta,
  items,
}: {
  meta?: Meta;
  items?: Meta[];
}) {
  const t = useT();
  const { openMeta, setView } = useView();
  const slides = (items && items.length > 0 ? items : meta ? [meta] : []).slice(0, 6);
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  const safeIndex = Math.min(index, slides.length - 1);
  const active = slides[safeIndex];
  const artwork = active.background || active.poster;
  const year = active.releaseInfo?.slice(0, 4);
  const genres = active.genres?.slice(0, 2) ?? [];

  const goPrev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);
  const goNext = () => setIndex((i) => (i + 1) % slides.length);

  return (
    <section
      aria-label={t("Discoveries")}
      className="group/banner relative isolate min-h-[296px] overflow-hidden rounded-[24px] border border-edge-soft/80 bg-surface shadow-[0_24px_60px_-28px_rgba(0,0,0,0.82)] sm:min-h-[336px]"
    >
      {artwork && (
        <img
          key={artwork}
          src={artwork}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/banner:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover/banner:scale-100"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/82 to-canvas/20"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-canvas/90 via-transparent to-canvas/25"
      />

      <div className="relative z-10 flex min-h-[296px] flex-col justify-between gap-6 p-6 sm:min-h-[336px] sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/50 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur-md">
              <Compass size={12} strokeWidth={2.2} />
              {t("Discoveries")}
            </span>
            {year && (
              <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11.5px] font-medium tabular-nums text-white/80 backdrop-blur-md">
                {year}
              </span>
            )}
            {active.imdbRating && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-white/90 backdrop-blur-md">
                <Star size={11} fill="currentColor" strokeWidth={0} className="text-info" />
                {active.imdbRating}
              </span>
            )}
            {genres.map((genre) => (
              <span
                key={genre}
                className="hidden rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11.5px] text-white/75 backdrop-blur-md sm:inline-flex"
              >
                {t(genre)}
              </span>
            ))}
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={goPrev}
                aria-label={t("common.previous")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ChevronLeft size={15} strokeWidth={2.2} className="dir-icon" />
              </button>
              <span className="px-1.5 text-[11px] font-medium tabular-nums text-white/80">
                {String(safeIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={goNext}
                aria-label={t("common.next")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ChevronRight size={15} strokeWidth={2.2} className="dir-icon" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-xl flex-col gap-2.5">
            <h2 className="line-clamp-2 font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.028em] text-ink sm:text-[36px]">
              {active.name}
            </h2>
            {active.description && (
              <p className="line-clamp-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
                {active.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="mac-primary-button"
                onClick={() => openMeta(active)}
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
                {t("View details")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/14 bg-black/45 px-4 py-2 text-[13px] font-medium text-white/90 backdrop-blur-md transition-colors duration-150 hover:border-white/25 hover:bg-black/65 hover:text-white"
                onClick={() => setView("discover")}
              >
                {t("Explore")}
              </button>
            </div>
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label={t("Discoveries")}>
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={slide.name}
                  aria-pressed={i === safeIndex}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                    i === safeIndex ? "w-7 bg-ink" : "w-2 bg-white/35 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
