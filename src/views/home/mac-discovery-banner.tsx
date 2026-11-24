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
  const slides = (items && items.length > 0 ? items : meta ? [meta] : []).slice(0, 5);
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
      className="vayra-stage group/banner min-h-[372px] sm:min-h-[420px]"
    >
      {artwork && (
        <img
          key={artwork}
          src={artwork}
          alt=""
          loading="eager"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/banner:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover/banner:scale-100"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/78 to-canvas/15"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/35 to-canvas/20"
      />

      <div className="relative z-10 flex min-h-[372px] flex-col justify-between gap-8 p-6 sm:min-h-[420px] sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-black/48 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/92 backdrop-blur-md">
              <Compass size={12} strokeWidth={2.2} />
              {t("Tonight on VAYRA")}
            </span>
            {year && (
              <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11.5px] font-medium tabular-nums text-white/85 backdrop-blur-md">
                {year}
              </span>
            )}
            {active.imdbRating && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-white/92 backdrop-blur-md">
                <Star size={11} fill="currentColor" strokeWidth={0} className="text-info" />
                {active.imdbRating}
              </span>
            )}
            {genres.map((genre) => (
              <span
                key={genre}
                className="hidden rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11.5px] text-white/80 backdrop-blur-md sm:inline-flex"
              >
                {t(genre)}
              </span>
            ))}
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-black/48 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={goPrev}
                aria-label={t("common.previous")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ChevronLeft size={15} strokeWidth={2.2} className="dir-icon" />
              </button>
              <span className="px-1.5 text-[11px] font-medium tabular-nums text-white/85">
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
          <div className="flex max-w-xl flex-col gap-3">
            <h2 className="line-clamp-2 font-display text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[42px]">
              {active.name}
            </h2>
            {active.description && (
              <p className="line-clamp-2 max-w-[54ch] text-[14.5px] leading-relaxed text-ink-muted">
                {active.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="mac-primary-button min-h-11 px-5"
                onClick={() => openMeta(active)}
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
                {t("View details")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/48 px-4.5 py-2 text-[13.5px] font-medium text-white/92 backdrop-blur-md transition-colors duration-150 hover:border-white/30 hover:bg-black/68 hover:text-white"
                onClick={() => setView("discover")}
              >
                {t("Explore")}
              </button>
            </div>
          </div>

          {slides.length > 1 && (
            <div
              className="flex items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label={t("Discoveries")}
            >
              {slides.map((slide, i) => {
                const thumb = slide.background || slide.poster;
                const current = i === safeIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    aria-label={slide.name}
                    aria-pressed={current}
                    title={slide.name}
                    onClick={() => setIndex(i)}
                    className={`group/thumb relative h-12 w-20 shrink-0 overflow-hidden rounded-xl border bg-elevated transition-[transform,opacity,border-color] duration-200 motion-reduce:transition-none ${
                      current
                        ? "scale-[1.04] border-ink opacity-100 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]"
                        : "border-white/15 opacity-55 hover:border-white/40 hover:opacity-90"
                    }`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center px-1.5 text-[10px] font-medium text-ink-muted line-clamp-2">
                        {slide.name}
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 bottom-0 h-0.5 transition-opacity ${
                        current ? "bg-ink opacity-100" : "opacity-0"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
