import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Layers, Play, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCollectionProgress } from "@/lib/collections-progress";
import { useT } from "@/lib/i18n";
import {
  peekCollectionArtwork,
  peekTmdbCollection,
  tmdbCollection,
  tmdbCollectionImages,
  type TmdbCollection,
} from "@/lib/providers/tmdb";
import { isPartWatched } from "@/lib/watched-flag";
import { useView } from "@/lib/view";

const SPOTLIGHT_IDS = [119, 10, 726871, 263, 1241, 328] as const;
const ROTATE_MS = 12_000;

type SpotlightEntry = {
  collection: TmdbCollection;
  heroBackdrop: string | null;
};

export function FeaturedCollectionStage({ tmdbKey }: { tmdbKey: string }) {
  const t = useT();
  const { openCollection, openMeta } = useView();
  const [entries, setEntries] = useState<SpotlightEntry[]>(() =>
    SPOTLIGHT_IDS.map((id) => {
      const col = peekTmdbCollection(id);
      if (!col) return null;
      const art = peekCollectionArtwork(id);
      return {
        collection: col,
        heroBackdrop: art?.heroBackdrop ?? col.backdrop ?? col.cardBackdrop ?? null,
      };
    }).filter((x): x is SpotlightEntry => x !== null),
  );
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!tmdbKey) return;
    let cancelled = false;
    void (async () => {
      const cols = await Promise.all(
        SPOTLIGHT_IDS.map((id) => tmdbCollection(tmdbKey, id).catch(() => null)),
      );
      if (cancelled) return;
      const loaded = cols.filter((c): c is TmdbCollection => c !== null && c.parts.length > 0);
      if (loaded.length === 0) return;
      setEntries(
        loaded.map((collection) => {
          const art = peekCollectionArtwork(collection.id);
          return {
            collection,
            heroBackdrop: art?.heroBackdrop ?? collection.backdrop ?? collection.cardBackdrop ?? null,
          };
        }),
      );
      const arts = await Promise.all(
        loaded.map((c) => tmdbCollectionImages(tmdbKey, c.id)),
      );
      if (cancelled) return;
      setEntries(
        loaded.map((collection, idx) => ({
          collection,
          heroBackdrop:
            arts[idx]?.heroBackdrop ?? collection.backdrop ?? collection.cardBackdrop ?? null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbKey]);

  useEffect(() => {
    if (paused || entries.length < 2) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActive((idx) => (idx + 1) % entries.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, entries.length]);

  const safeIdx = entries.length > 0 ? active % entries.length : 0;
  const current = entries[safeIdx] ?? null;
  const parts = useMemo(() => current?.collection.parts ?? [], [current]);
  const progress = useCollectionProgress(parts);

  if (!current) {
    return (
      <section
        aria-label={t("Featured saga")}
        className="vayra-stage min-h-[310px] animate-pulse bg-surface/80 sm:min-h-[350px]"
      />
    );
  }

  const { collection, heroBackdrop } = current;
  const stripParts = collection.parts.slice(0, 5);
  const nextPart = progress.nextUnwatched ?? collection.parts[0] ?? null;
  const goPrev = () => setActive((i) => (i - 1 + entries.length) % entries.length);
  const goNext = () => setActive((i) => (i + 1) % entries.length);

  return (
    <section
      aria-label={t("Featured saga")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="vayra-stage relative flex min-h-[320px] flex-col justify-between p-6 sm:min-h-[370px] sm:p-8 lg:p-10"
    >
      {/* Background artwork */}
      {heroBackdrop ? (
        <img
          key={heroBackdrop}
          src={heroBackdrop}
          alt=""
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center transition-opacity duration-500 motion-reduce:transition-none"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-br from-raised via-surface to-canvas"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#0a0b0d]/95 via-[#0a0b0d]/72 to-[#0a0b0d]/25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#0a0b0d]/95 via-[#0a0b0d]/35 to-transparent"
      />

      {/* Top editorial bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="vayra-kicker text-white/70">{t("Featured saga")}</span>
          {entries.length > 1 && (
            <span className="text-[11px] font-medium tabular-nums tracking-[0.14em] text-white/45">
              {String(safeIdx + 1).padStart(2, "0")} / {String(entries.length).padStart(2, "0")}
            </span>
          )}
        </div>
        {entries.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("Previous saga")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-[#0a0b0d]/55 text-white/80 backdrop-blur-md transition-colors hover:border-white/28 hover:bg-[#0a0b0d]/80 hover:text-white"
            >
              <ChevronLeft size={16} strokeWidth={2.2} className="dir-icon" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("Next saga")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-[#0a0b0d]/55 text-white/80 backdrop-blur-md transition-colors hover:border-white/28 hover:bg-[#0a0b0d]/80 hover:text-white"
            >
              <ChevronRight size={16} strokeWidth={2.2} className="dir-icon" />
            </button>
          </div>
        )}
      </div>

      {/* Main editorial content + interactive film strip */}
      <div className="mt-8 grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 max-w-2xl flex-col gap-3.5">
          <h2 className="font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[40px]">
            {collection.displayName}
          </h2>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-medium text-white/80 tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <Layers size={13} strokeWidth={2.2} className="text-white/65" />
              {collection.parts.length === 1
                ? t("{n} film", { n: collection.parts.length })
                : t("{count} films", { count: collection.parts.length })}
            </span>
            {collection.yearRange && (
              <>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />
                <span>{collection.yearRange}</span>
              </>
            )}
            {collection.averageRating && (
              <>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1 text-white">
                  <Star size={12.5} className="fill-amber-400 text-amber-400" />
                  {collection.averageRating}
                </span>
              </>
            )}
            {progress.watchedCount > 0 && (
              <>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <Check size={12.5} strokeWidth={2.6} />
                  {t("{watched}/{total} seen", {
                    watched: progress.watchedCount,
                    total: progress.releasedCount,
                  })}
                </span>
              </>
            )}
          </div>

          {collection.overview && (
            <p className="line-clamp-2 text-[14px] leading-relaxed text-white/75 sm:text-[14.5px]">
              {collection.overview}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openCollection(collection.id)}
              className="mac-primary-button"
            >
              <span>{t("Explore saga")}</span>
              <ArrowUpRight size={14} strokeWidth={2.2} />
            </button>
            {nextPart && (
              <button
                type="button"
                onClick={() => openMeta(nextPart)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-[#0a0b0d]/55 px-3.5 py-2 text-[13px] font-medium text-white/90 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#0a0b0d]/78 hover:text-white"
              >
                <Play size={12.5} fill="currentColor" />
                <span className="max-w-[220px] truncate">
                  {progress.watchedCount > 0 && progress.nextUnwatched
                    ? t("Continue: {title}", { title: nextPart.name })
                    : nextPart.name}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive chapter posters */}
        {stripParts.length > 0 && (
          <div className="hidden items-end gap-2.5 md:flex">
            {stripParts.map((part, idx) => {
              const watched = isPartWatched(part.id, part.type);
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => openMeta(part)}
                  title={part.releaseInfo ? `${part.name} (${part.releaseInfo})` : part.name}
                  aria-label={part.name}
                  className="group/part relative aspect-[2/3] w-[76px] shrink-0 overflow-hidden rounded-xl border border-white/15 bg-elevated shadow-[0_16px_32px_-12px_rgba(0,0,0,0.92)] transition-[transform,border-color] duration-200 hover:-translate-y-1.5 hover:border-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:w-[82px]"
                >
                  {part.poster ? (
                    <img
                      src={part.poster}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-1.5 text-center text-[10px] font-medium text-ink-muted">
                      {part.name}
                    </span>
                  )}
                  <span className="absolute start-1.5 top-1.5 rounded bg-[#0a0b0d]/78 px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums text-white/85 backdrop-blur-sm">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {watched && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1.5 end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/90 text-canvas shadow"
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
            {collection.parts.length > stripParts.length && (
              <button
                type="button"
                onClick={() => openCollection(collection.id)}
                className="flex aspect-[2/3] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-[#0a0b0d]/60 text-white/80 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#0a0b0d]/85 hover:text-white"
                aria-label={t("See all {count} films", { count: collection.parts.length })}
              >
                <span className="text-[14px] font-semibold tabular-nums">
                  +{collection.parts.length - stripParts.length}
                </span>
                <ArrowUpRight size={13} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saga switcher pills */}
      {entries.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-4">
          {entries.map((entry, idx) => {
            const on = idx === safeIdx;
            return (
              <button
                key={entry.collection.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(idx)}
                className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
                  on
                    ? "bg-white text-[#0a0b0d]"
                    : "bg-[#0a0b0d]/50 text-white/68 ring-1 ring-white/12 hover:bg-[#0a0b0d]/80 hover:text-white"
                }`}
              >
                {entry.collection.displayName}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
