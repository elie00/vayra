import { useRef, useState, type ReactNode } from "react";
import { Check, Play, Plus, X } from "lucide-react";
import type { Slide } from "@/components/hero-carousel";
import { PickCard } from "@/components/pick-card";
import { TopRankCard } from "@/components/top-rank-card";
import { Row } from "@/components/row";
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

// Mobile-first Home (Apple Sports card model). Rendered from `Home` in
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
        <TmdbNudge suppress={nudgeSuppress} />

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

        {rows.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={`skel-${i}`} />)
          : rows.map((row) => <MobileRail key={row.key} row={row} onLoadMore={loadMore} />)}
      </div>
    </main>
  );
}

// A single full-width hero card. Exported so MobileDiscover can reuse it for its
// featured item. Reuses the same actions as the desktop Hero (openMeta on tap /
// Play, toggleWatchlist for the watchlist button).
export function MobileHeroCard({ meta, label }: { meta: Meta; label?: string }) {
  const t = useT();
  const { openMeta } = useView();
  const inWatchlist = useInWatchlist(meta.id);
  const bg = meta.background || meta.poster;

  return (
    <div
      onClick={() => openMeta(meta)}
      className="relative aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-3xl bg-elevated"
    >
      {bg && (
        <img src={bg} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          {label && <Chip>{t(label)}</Chip>}
          {meta.releaseInfo && <Chip>{meta.releaseInfo}</Chip>}
        </div>
        {meta.logo ? (
          <img
            src={meta.logo}
            alt={meta.name}
            decoding="async"
            className="max-h-16 w-auto max-w-[72%] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <h2 className="text-[28px] font-semibold leading-[1.05] tracking-tight text-ink">
            {meta.name}
          </h2>
        )}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMeta(meta);
            }}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-semibold text-canvas transition-transform active:scale-95"
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
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge bg-canvas/60 text-ink transition-transform active:scale-95"
          >
            {inWatchlist ? <Check size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileHeroRow({ slides }: { slides: Slide[] }) {
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
    <div className="flex flex-col gap-3">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s) => (
          <div key={s.meta.id} className="w-full shrink-0 snap-center">
            <MobileHeroCard meta={s.meta} label={s.rank.label} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? "w-6 bg-ink" : "w-1.5 bg-ink-muted/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileContinueWatching({
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
    <section className="flex flex-col gap-3">
      <h3 className="px-1 text-[19px] font-semibold tracking-tight text-ink">
        {t("Continue Watching")}
      </h3>
      <div className="flex flex-col gap-2.5">
        {items.slice(0, 12).map((item) => (
          <MobileCwCard key={item._id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}

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
    <div className="group relative flex items-center gap-3.5 rounded-2xl bg-elevated/50 p-2.5">
      <button
        type="button"
        onClick={() => openMeta(meta)}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-start"
      >
        <div className="relative aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-xl bg-elevated">
          {thumb && (
            <img src={thumb} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-canvas/40">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[15px] font-medium text-ink">{item.name}</p>
          {label && <p className="text-[12.5px] text-ink-subtle">{label}</p>}
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDismiss(item)}
        aria-label={t("Remove from Continue Watching")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-canvas/60 active:text-ink"
      >
        <X size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function MobileRail({
  row,
  onLoadMore,
}: {
  row: HomeRow;
  onLoadMore: (rowKey: string) => void;
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
      min={112}
      scrollKey={`home:mobile:${row.key}`}
      onViewAll={viewAll}
      onEndReached={row.hasMore ? () => onLoadMore(row.key) : undefined}
    >
      {metas.map((m, i) => (
        <PickCard key={`${m.id}-${i}`} meta={m} />
      ))}
    </Row>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-canvas/70 px-3 py-1 text-[12px] font-medium text-ink backdrop-blur-sm">
      {children}
    </span>
  );
}

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w300/");
}
