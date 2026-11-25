import { Check, Layers, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useCollectionProgress } from "@/lib/collections-progress";
import { useT } from "@/lib/i18n";
import {
  cleanCollectionTitle,
  collectionNameMatches,
  peekCollectionArtwork,
  peekTmdbCollection,
  tmdbCollection,
  tmdbCollectionImages,
  tmdbSearchCollectionId,
  type TmdbCollection,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";

const FAN_LAYOUT: Record<number, Array<{ base: string; hover: string; z: string }>> = {
  1: [
    {
      base: "end-1 bottom-0 rotate-[2deg]",
      hover: "group-hover/card:-translate-y-1 group-hover/card:rotate-0",
      z: "z-20",
    },
  ],
  2: [
    {
      base: "end-7 bottom-0.5 -rotate-[7deg] brightness-[0.86]",
      hover: "group-hover/card:-translate-x-1.5 group-hover/card:-rotate-[11deg] group-hover/card:brightness-95",
      z: "z-10",
    },
    {
      base: "end-0 bottom-0 rotate-[5deg]",
      hover: "group-hover/card:translate-x-1 group-hover/card:-translate-y-1 group-hover/card:rotate-[8deg]",
      z: "z-20",
    },
  ],
  3: [
    {
      base: "end-11 bottom-1 -rotate-[10deg] brightness-[0.78]",
      hover: "group-hover/card:-translate-x-2.5 group-hover/card:-rotate-[14deg] group-hover/card:brightness-90",
      z: "z-10",
    },
    {
      base: "end-5 bottom-0.5 -rotate-[1deg] brightness-[0.9]",
      hover: "group-hover/card:-translate-y-1.5 group-hover/card:rotate-0 group-hover/card:brightness-100",
      z: "z-20",
    },
    {
      base: "end-0 bottom-0 rotate-[8deg]",
      hover: "group-hover/card:translate-x-1.5 group-hover/card:-translate-y-0.5 group-hover/card:rotate-[12deg]",
      z: "z-30",
    },
  ],
};

function PosterFolioFan({ posters }: { posters: string[] }) {
  const visible = posters.slice(0, 3);
  if (visible.length === 0) return null;
  const slots = FAN_LAYOUT[visible.length] ?? FAN_LAYOUT[3];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-3.5 end-3.5 hidden h-[86px] w-[108px] sm:block"
    >
      {visible.map((url, idx) => {
        const slot = slots[idx] ?? slots[slots.length - 1];
        return (
          <div
            key={url}
            className={`absolute h-[78px] w-[52px] overflow-hidden rounded-[7px] bg-elevated ring-1 ring-white/20 shadow-[0_12px_26px_-8px_rgba(0,0,0,0.92)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none ${slot.z} ${slot.base} ${slot.hover}`}
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        );
      })}
    </div>
  );
}

export function CollectionCard({
  id,
  name,
  knownBackdrop,
  knownCount,
  knownPosters,
  knownYearRange,
  knownRating,
  onResolved,
}: {
  id: number;
  name: string;
  knownBackdrop?: string | null;
  knownCount?: number | null;
  knownPosters?: string[];
  knownYearRange?: string | null;
  knownRating?: string | null;
  onResolved?: (col: TmdbCollection) => void;
}) {
  const { settings } = useSettings();
  const { openCollection } = useView();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const initialCol = id > 0 ? peekTmdbCollection(id) : null;
  const initialArt = id > 0 ? peekCollectionArtwork(id) : null;

  const [inView, setInView] = useState(Boolean(initialCol));
  const [col, setCol] = useState<TmdbCollection | null>(initialCol);
  const [curatedBackdrop, setCuratedBackdrop] = useState<string | null>(
    initialArt?.cardBackdrop ?? null,
  );
  const [resolvedId, setResolvedId] = useState<number>(initialCol?.id ?? id);
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "420px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || !settings.tmdbKey) return;
    let cancelled = false;
    void (async () => {
      let fetched: TmdbCollection | null =
        id > 0 ? await tmdbCollection(settings.tmdbKey, id).catch(() => null) : null;
      if (!fetched || (id <= 0 && !collectionNameMatches(fetched.name, name))) {
        const healedId = await tmdbSearchCollectionId(settings.tmdbKey, name).catch(() => null);
        if (healedId != null && healedId !== id) {
          fetched = await tmdbCollection(settings.tmdbKey, healedId).catch(() => null);
        }
      }
      if (cancelled || !fetched) return;
      setCol(fetched);
      setResolvedId(fetched.id);
      onResolved?.(fetched);

      const art = await tmdbCollectionImages(settings.tmdbKey, fetched.id);
      if (!cancelled && art?.cardBackdrop) {
        setCuratedBackdrop(art.cardBackdrop);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, id, name, settings.tmdbKey, onResolved]);

  const parts: Meta[] = useMemo(() => col?.parts ?? [], [col]);
  const progress = useCollectionProgress(parts);

  const displayTitle = col?.displayName || cleanCollectionTitle(name);
  const backdrop = curatedBackdrop ?? col?.cardBackdrop ?? knownBackdrop ?? null;
  const posterStack =
    col && col.posterStack.length > 0 ? col.posterStack : (knownPosters ?? []);
  const count = col?.parts.length ?? knownCount ?? null;
  const yearRange = col?.yearRange ?? knownYearRange ?? null;
  const rating = col?.averageRating ?? knownRating ?? null;
  const playable = resolvedId > 0;
  const hasFan = posterStack.length > 0;

  useEffect(() => {
    setBackdropLoaded(false);
  }, [backdrop]);

  const countLabel =
    count == null
      ? t("Collection")
      : count === 1
        ? t("{n} film", { n: count })
        : t("{count} films", { count });

  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={!playable || undefined}
      onClick={() => {
        if (playable) openCollection(resolvedId);
      }}
      className={`group/card relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-edge-soft/80 bg-surface text-start shadow-[0_14px_34px_-22px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)] transition-[border-color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none ${
        playable
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-white/22 hover:shadow-[0_22px_48px_-22px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.12)] motion-reduce:hover:translate-y-0"
          : "cursor-default opacity-80"
      }`}
    >
      {/* Ambient studio base when backdrop is absent or still decoding */}
      {posterStack[0] ? (
        <img
          src={posterStack[0]}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl saturate-125"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-raised/90 via-elevated to-canvas"
        />
      )}

      {/* Curated widescreen cover artwork */}
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          data-loaded={backdropLoaded ? "true" : "false"}
          onLoad={() => setBackdropLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.035] data-[loaded=true]:opacity-100 motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
        />
      )}

      {/* Multi-stop VAYRA editorial scrims for razor-sharp contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#0a0b0d]/22 transition-opacity duration-300 group-hover/card:opacity-65 motion-reduce:transition-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0b0d]/95 via-[#0a0b0d]/42 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0b0d]/78 via-[#0a0b0d]/22 to-transparent"
      />

      {/* Top metadata pills */}
      <div className="absolute start-3.5 top-3 z-10 flex flex-wrap items-center gap-1.5 max-sm:start-2.5 max-sm:top-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-[#0a0b0d]/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md max-sm:px-2 max-sm:py-0.5 max-sm:text-[9.5px]">
          <Layers size={10.5} strokeWidth={2.3} className="text-white/75" />
          <span className="tabular-nums">{countLabel}</span>
        </span>
        {progress.watchedCount > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums backdrop-blur-md max-sm:hidden ${
              progress.complete
                ? "border-emerald-400/35 bg-emerald-500/20 text-emerald-200"
                : "border-white/15 bg-white/12 text-white/92"
            }`}
          >
            <Check size={10.5} strokeWidth={2.6} />
            {t("{watched}/{total} seen", {
              watched: progress.watchedCount,
              total: progress.releasedCount,
            })}
          </span>
        )}
      </div>

      {/* Signature VAYRA Collector's Poster Fan */}
      <PosterFolioFan posters={posterStack} />

      {/* Bottom editorial title & saga metadata */}
      <div
        className={`absolute inset-x-4 bottom-3.5 z-10 flex flex-col gap-1 max-sm:inset-x-3 max-sm:bottom-2.5 ${
          hasFan ? "sm:pe-[116px]" : ""
        }`}
      >
        <h3 className="line-clamp-2 font-display text-[20px] font-semibold leading-[1.12] tracking-[-0.02em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] max-sm:text-[15.5px] max-sm:leading-[1.2]">
          {displayTitle}
        </h3>
        {(yearRange || rating) && (
          <div className="flex items-center gap-2 text-[11.5px] font-medium tabular-nums text-white/72 max-sm:text-[10.5px]">
            {yearRange && <span>{yearRange}</span>}
            {yearRange && rating && (
              <span aria-hidden="true" className="h-0.5 w-0.5 rounded-full bg-white/45" />
            )}
            {rating && (
              <span className="inline-flex items-center gap-1 text-white/85">
                <Star size={10.5} className="fill-amber-400/90 text-amber-400/90" />
                {rating}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Personal saga progress bar */}
      {progress.watchedCount > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[2.5px] bg-white/12"
        >
          <div
            className={`h-full transition-[width] duration-300 ${
              progress.complete ? "bg-emerald-400/90" : "bg-ink/90"
            }`}
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
      )}
    </button>
  );
}
