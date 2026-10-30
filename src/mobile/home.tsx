import { useRef, useState } from "react";
import { Check, Play, Plus, X } from "lucide-react";
import type { Slide } from "@/components/hero-carousel";
import { HarborMark } from "@/components/icons/harbor-mark";
import { PickCard } from "@/components/pick-card";
import { TopRankCard } from "@/components/top-rank-card";
import { MOBILE_POSTER_MIN, Row } from "@/components/row";
import { TmdbNudge } from "@/components/nudge";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import {
  episodeFromVideoId,
  isAnimeCwItem,
  libraryMetaType,
  type LibraryItem,
} from "@/lib/stremio";
import { useView } from "@/lib/view";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import type { HomeRow } from "@/views/home/home-types";
import { RowSkeleton } from "@/views/home/row-skeleton";
import { LumaResumeSection } from "@/views/home/luma-resume-section";

// Mobile-first Home (streaming-app model: hero, Continue Watching, poster rails). Rendered from `Home` in
// src/views/home.tsx when isMobileTauri(); every data hook still runs in the
// original component and its already-computed values are passed as props here.
//
// Usage (inside Home, right before the desktop return):
//   if (isMobileTauri())
//     return (
//       <MobileHome
//         nudgeSuppress={tmdbProvidedByAddon || settings.homeMode === "classic"}
//         heroSlides={heroSlides}
//         signedIn={!!authKey}
//         cwItems={cwItems}
//         onDismissCw={onDismissCw}
//         top10={top10}
//         top10Title={displayed.top10Title}
//         rows={visibleRows}
//         loadMore={loadMore}
//       />
//     );
export function MobileHome({
  nudgeSuppress,
  heroSlides,
  signedIn,
  cwItems,
  onDismissCw,
  top10,
  top10Title,
  rows,
  loadMore,
}: {
  nudgeSuppress: boolean;
  heroSlides: Slide[];
  signedIn: boolean;
  cwItems: LibraryItem[];
  onDismissCw: (item: LibraryItem) => void;
  top10: Meta[];
  top10Title: string;
  rows: HomeRow[];
  loadMore: (rowKey: string) => void;
}) {
  const t = useT();
  const top10RailTitle = top10Title
    ? top10Title.toLowerCase().includes("top")
      ? t(top10Title)
      : t("Top 10 {name}", { name: t(top10Title) })
    : t("Top 10");

  return (
    <main className="flex-1 overflow-y-auto px-4 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))]">
      <div className="flex flex-col gap-8 pt-2">
        {heroSlides.length > 0 && <MobileHeroRow slides={heroSlides} />}

        <LumaResumeSection />

        <MobileContinueWatching items={cwItems} signedIn={signedIn} onDismiss={onDismissCw} />

        {top10.length >= 10 && (
          <Row title={top10RailTitle} min={112} shape="rank" scrollKey="home:mobile:top10">
            {top10.map((m, i) => (
              <TopRankCard key={m.id} meta={m} rank={i + 1} />
            ))}
          </Row>
        )}

        <TmdbNudge suppress={nudgeSuppress} />

        {rows.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={`skel-${i}`} />)
          : rows.map((row) => <MobileRail key={row.key} row={row} onLoadMore={loadMore} />)}
      </div>
    </main>
  );
}

/** Hero slides for a catalog page, where the page already says what they are. */
export function heroSlides(metas: Meta[]): Slide[] {
  return metas.map((meta, i) => ({ meta, rank: { label: "", position: i + 1 } }));
}

// A single full-width hero card, as streaming apps open their home: the title
// centred over the artwork, a line of genres, then Play and the watchlist side
// by side. Exported so MobileDiscover can reuse it for its featured item. Play
// starts a movie (like the preview sheet) and opens a series to pick an episode.
export function MobileHeroCard({ meta, label }: { meta: Meta; label?: string }) {
  const t = useT();
  const { openMeta, openPicker } = useView();
  const inWatchlist = useInWatchlist(meta.id);
  const bg = meta.background || meta.poster;
  const tags = [meta.releaseInfo, ...(meta.genres ?? []).slice(0, 3).map((g) => t(g))].filter(Boolean);

  return (
    <div
      onClick={() => openMeta(meta)}
      className="relative aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-3xl bg-elevated ring-1 ring-edge-soft/40 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]"
    >
      {bg && (
        <img src={bg} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-5 text-center">
        {label && (
          <span className="flex items-center gap-1.5 type-micro font-semibold uppercase tracking-[0.28em] text-ink-muted">
            <HarborMark className="h-3.5 w-3.5" />
            {t(label)}
          </span>
        )}
        {meta.logo ? (
          <img
            src={meta.logo}
            alt={meta.name}
            decoding="async"
            className="max-h-20 w-auto max-w-[78%] object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <h2 className="font-display type-display font-medium leading-[1.05] tracking-tight text-ink" dir="auto">
            {meta.name}
          </h2>
        )}
        {tags.length > 0 && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 type-footnote text-ink-muted">
            {tags.map((tag, i) => (
              <span key={`${tag}-${i}`} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-ink-subtle" />}
                {tag}
              </span>
            ))}
          </p>
        )}
        <div className="mt-1 flex w-full gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (meta.type === "movie") openPicker(meta, undefined, { autoPlay: true, resume: true });
              else openMeta(meta);
            }}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink type-callout font-semibold text-canvas transition-transform active:scale-95"
          >
            <Play size={18} fill="currentColor" />
            {t("Play")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist({
                id: meta.id,
                type: meta.type,
                name: meta.name,
                poster: meta.poster,
              });
            }}
            aria-label={inWatchlist ? t("In Watchlist") : t("Add to Watchlist")}
            aria-pressed={inWatchlist}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-edge-soft/70 bg-elevated/75 type-callout font-semibold text-ink backdrop-blur-md transition-transform active:scale-95"
          >
            {inWatchlist ? <Check size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.2} />}
            {t("To watch")}
          </button>
        </div>
      </div>
    </div>
  );
}

// The home carousel, after HBO Max: each slide's artwork runs edge to edge and
// up under the transparent header, with the title, a line of genres, then Play
// on the left and the watchlist on the right. It cancels the page's gutters and
// header offset (5rem + status bar, plus the 0.5rem the pages add) to bleed.
export function MobileHeroRow({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const per = el.scrollWidth / slides.length;
    if (per <= 0) return;
    setActive(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / per))));
  };

  return (
    <div className="-mx-4 -mt-[calc(5.5rem+var(--harbor-status-bar,1.75rem))] flex flex-col gap-4">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s) => (
          <div key={s.meta.id} className="w-full shrink-0 snap-center">
            <HeroSlide meta={s.meta} label={s.rank.label} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-2.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors duration-300 ${i === active ? "bg-ink" : "bg-ink-muted/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroSlide({ meta, label }: { meta: Meta; label?: string }) {
  const t = useT();
  const { openMeta, openPicker } = useView();
  const inWatchlist = useInWatchlist(meta.id);
  const bg = meta.background || meta.poster;
  const tags = [meta.releaseInfo, ...(meta.genres ?? []).slice(0, 2).map((g) => t(g))].filter(Boolean);

  return (
    <div className="relative">
      <button type="button" onClick={() => openMeta(meta)} aria-label={meta.name} className="relative block aspect-[3/4] w-full overflow-hidden bg-elevated">
        {bg && <img src={bg} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-canvas/50 via-transparent via-40% to-canvas" />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 px-4">
        {label && (
          <span className="flex items-center gap-1.5 type-caption font-semibold uppercase tracking-[0.24em] text-ink-muted">
            <HarborMark className="h-3.5 w-3.5" />
            {t(label)}
          </span>
        )}
        {meta.logo ? (
          <img src={meta.logo} alt={meta.name} decoding="async" className="max-h-20 w-auto max-w-[75%] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]" />
        ) : (
          <h2 className="font-display text-[34px] font-medium leading-[1.02] tracking-tight text-ink" dir="auto">
            {meta.name}
          </h2>
        )}
        {tags.length > 0 && <p className="type-footnote text-ink-muted">{tags.join("  ·  ")}</p>}
        <div className="pointer-events-auto -ms-1 mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => (meta.type === "movie" ? openPicker(meta, undefined, { autoPlay: true, resume: true }) : openMeta(meta))}
            className="flex h-12 items-center gap-2.5 rounded-full ps-1 pe-4 type-title-3 font-semibold text-ink transition-transform active:scale-95"
          >
            <Play size={24} fill="currentColor" />
            {t("Play")}
          </button>
          <button
            type="button"
            onClick={() => toggleWatchlist({ id: meta.id, type: meta.type, name: meta.name, poster: meta.poster })}
            aria-label={inWatchlist ? t("In Watchlist") : t("Add to Watchlist")}
            aria-pressed={inWatchlist}
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
          >
            {inWatchlist ? <Check size={28} strokeWidth={2.2} /> : <Plus size={30} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileContinueWatching({
  items,
  signedIn,
  onDismiss,
}: {
  items: LibraryItem[];
  signedIn: boolean;
  onDismiss: (item: LibraryItem) => void;
}) {
  const t = useT();
  if (items.length === 0) {
    if (!signedIn) return null;
    return null;
  }
  return (
    <Row title={t("Continue Watching")} min={150} shape="landscape" scrollKey="mobile:cw">
      {items.slice(0, 12).map((item) => (
        <MobileCwCard key={item._id} item={item} onDismiss={onDismiss} />
      ))}
    </Row>
  );
}

// A landscape still with the progress along its bottom edge, then the title and
// episode. Like the desktop card, a tap opens the title at that episode.
function MobileCwCard({
  item,
  onDismiss,
}: {
  item: LibraryItem;
  onDismiss: (item: LibraryItem) => void;
}) {
  const t = useT();
  const { openMeta } = useView();
  const dur = item.state?.duration ?? 0;
  const off = item.state?.timeOffset ?? 0;
  const progress = dur > 0 ? Math.min(1, off / dur) : 0;
  const ep =
    item.state?.season && item.state?.episode
      ? { season: item.state.season, episode: item.state.episode }
      : episodeFromVideoId(item.state?.video_id);
  const label =
    isAnimeCwItem(item) && ep ? `Ep ${ep.episode}` : ep ? `S${ep.season}E${ep.episode}` : "";
  const meta: Meta = {
    id: item._id,
    type: libraryMetaType(item.type),
    name: item.name,
    poster: item.poster,
    background: item.background,
  };
  const thumb = downscaleTmdb(item.background || item.poster);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => openMeta(meta, ep ? { episodeHint: ep } : undefined)}
        aria-label={label ? `${item.name} · ${label}` : item.name}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-elevated transition-transform active:scale-[0.97]"
      >
        {thumb ? (
          <img src={thumb} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center text-ink-subtle">
            <Play size={22} fill="currentColor" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-ink/20">
          <span className="block h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </span>
      </button>
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate type-footnote font-medium text-ink">{item.name}</p>
          {label && <p className="type-caption text-ink-subtle">{label}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(item)}
          aria-label={t("Remove from Continue Watching")}
          className="-me-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-elevated active:text-ink"
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

export function MobileRail({
  row,
  onLoadMore,
  scrollPrefix = "home:mobile",
}: {
  row: HomeRow;
  onLoadMore: (rowKey: string) => void;
  scrollPrefix?: string;
}) {
  const t = useT();
  const { openGrid } = useView();
  const metas = row.metas.filter((m) => typeof m.id === "string");
  if (metas.length === 0) return null;
  const viewAll = row.fetcher
    ? () => openGrid({ title: t(row.name), fetcher: row.fetcher!, initial: row.metas })
    : undefined;
  return (
    <Row
      title={t(row.name)}
      min={MOBILE_POSTER_MIN}
      scrollKey={`${scrollPrefix}:${row.key}`}
      onViewAll={viewAll}
      onEndReached={row.hasMore ? () => onLoadMore(row.key) : undefined}
    >
      {metas.map((m, i) => (
        <PickCard key={`${m.id}-${i}`} meta={m} />
      ))}
    </Row>
  );
}

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w300/");
}
