import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Play,
  RotateCcw,
  Settings,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PickCard } from "@/components/pick-card";
import type { Meta } from "@/lib/cinemeta";
import { useCollectionProgress } from "@/lib/collections-progress";
import { useT } from "@/lib/i18n";
import {
  cleanCollectionTitle,
  peekCollectionArtwork,
  peekTmdbCollection,
  tmdbCollection,
  tmdbCollectionImages,
  type TmdbCollection,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { layoutHasGlobalBack } from "@/lib/theme";
import { useScrollMemory, useView } from "@/lib/view";
import { isPartWatched } from "@/lib/watched-flag";

type FilmSort = "chrono" | "newest" | "rating";
type FilmLayout = "grid" | "timeline";

export function CollectionView({ collectionId }: { collectionId: number }) {
  const t = useT();
  const { settings } = useSettings();
  const { goBack, openCollections, openMeta, setView } = useView();

  const initialCol = peekTmdbCollection(collectionId);
  const initialArt = peekCollectionArtwork(collectionId);

  const [data, setData] = useState<TmdbCollection | null>(initialCol);
  const [heroBackdrop, setHeroBackdrop] = useState<string | null>(
    initialArt?.heroBackdrop ?? initialCol?.backdrop ?? initialCol?.cardBackdrop ?? null,
  );
  const [loading, setLoading] = useState(!initialCol);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [sort, setSort] = useState<FilmSort>("chrono");
  const [layout, setLayout] = useState<FilmLayout>("grid");
  const [expandedOverview, setExpandedOverview] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollMemory(`collection-${collectionId}`, scrollRef);

  useEffect(() => {
    if (!settings.tmdbKey) {
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const cached = peekTmdbCollection(collectionId);
    if (!cached) {
      setLoading(true);
      setData(null);
    }
    setFailed(false);

    tmdbCollection(settings.tmdbKey, collectionId)
      .then((c) => {
        if (cancelled) return;
        if (!c) {
          setFailed(true);
          setLoading(false);
          return;
        }
        setData(c);
        setHeroBackdrop((prev) => prev ?? c.backdrop ?? c.cardBackdrop ?? null);
        setLoading(false);

        void tmdbCollectionImages(settings.tmdbKey, c.id).then((art) => {
          if (!cancelled && art?.heroBackdrop) {
            setHeroBackdrop(art.heroBackdrop);
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, collectionId, retryTick]);

  const parts = useMemo(() => data?.parts ?? [], [data]);
  const progress = useCollectionProgress(parts);

  // Preserve each film's canonical chronological chapter index regardless of sort order.
  const indexedParts = useMemo(
    () => parts.map((meta, idx) => ({ meta, chapter: idx + 1 })),
    [parts],
  );

  const sortedParts = useMemo(() => {
    if (sort === "newest") {
      return [...indexedParts].sort((a, b) =>
        (b.meta.releaseDate ?? "").localeCompare(a.meta.releaseDate ?? ""),
      );
    }
    if (sort === "rating") {
      return [...indexedParts].sort(
        (a, b) => Number(b.meta.imdbRating ?? 0) - Number(a.meta.imdbRating ?? 0),
      );
    }
    return indexedParts;
  }, [indexedParts, sort]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const displayName = data ? data.displayName || cleanCollectionTitle(data.name) : t("Collection");
  const frontPoster = data?.poster ?? data?.posterStack[0] ?? null;
  const backPoster =
    data?.posterStack.find((p) => p !== frontPoster) ?? data?.posterStack[1] ?? null;
  const primaryTarget = progress.nextUnwatched ?? parts[0] ?? null;
  const overviewLong = (data?.overview?.length ?? 0) > 220;

  const gridClass =
    "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

  return (
    <main ref={scrollRef} data-rail-flush className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
      {/* Soft ambient bleed */}
      {heroBackdrop && (
        <div
          aria-hidden="true"
          className="harbor-bleed-stremio pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px]"
          style={{
            backgroundImage: `url(${heroBackdrop})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(72px) saturate(1.25)",
            opacity: 0.22,
          }}
        />
      )}

      {/* Cinematic Collector's Header */}
      <div className="relative">
        {heroBackdrop && (
          <div className="harbor-bleed-stremio pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
            <img
              src={heroBackdrop}
              alt=""
              decoding="async"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/72 to-canvas/15" />
            <div className="absolute inset-0 bg-gradient-to-r from-canvas/92 via-canvas/45 to-transparent" />
          </div>
        )}

        <div className="relative mx-auto w-full max-w-[1700px] px-12 pt-24 max-sm:px-4 max-sm:pt-[calc(4.5rem+var(--harbor-status-bar,1.75rem))]">
          {/* Breadcrumb & Back */}
          <nav aria-label={t("Breadcrumb")} className="flex items-center gap-2.5">
            {!layoutHasGlobalBack() && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t("Back")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[#0a0b0d]/55 text-white/85 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#0a0b0d]/80 hover:text-white"
              >
                <ArrowLeft size={16} strokeWidth={2.2} className="dir-icon" />
              </button>
            )}
            <button
              type="button"
              onClick={openCollections}
              className="rounded-full border border-white/12 bg-[#0a0b0d]/50 px-3 py-1 text-[12px] font-medium text-white/75 backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
            >
              {t("Collections")}
            </button>
            <ChevronRight size={13} className="dir-icon text-white/35" aria-hidden="true" />
            <span className="truncate text-[12px] font-medium text-white/60">{displayName}</span>
          </nav>

          {/* Hero body */}
          {loading ? (
            <div className="mt-10 flex items-end gap-8 pb-4">
              <div className="hidden aspect-[2/3] w-44 shrink-0 animate-pulse rounded-2xl bg-elevated/55 sm:block" />
              <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-3.5">
                <div className="h-3 w-28 animate-pulse rounded bg-elevated/55" />
                <div className="h-12 w-3/4 animate-pulse rounded-lg bg-elevated/65" />
                <div className="h-4 w-56 animate-pulse rounded bg-elevated/45" />
                <div className="h-16 w-full animate-pulse rounded-lg bg-elevated/40" />
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-start gap-7 pb-4 sm:flex-row sm:items-end">
              {/* Collector's Layered Cover */}
              {frontPoster && (
                <div className="relative hidden shrink-0 sm:block">
                  {backPoster && (
                    <img
                      src={backPoster}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute -end-4 top-3 aspect-[2/3] w-36 rotate-[6deg] rounded-2xl object-cover opacity-50 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12"
                    />
                  )}
                  <img
                    src={frontPoster}
                    alt=""
                    draggable={false}
                    className="relative z-10 aspect-[2/3] w-44 rounded-2xl object-cover shadow-[0_30px_68px_-22px_rgba(0,0,0,0.9)] ring-1 ring-white/18"
                  />
                </div>
              )}

              <div className="min-w-0 max-w-3xl flex-1">
                <p className="vayra-kicker text-white/65">{t("VAYRA Collection")}</p>
                <h1 className="mt-2 font-display text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.03] tracking-[-0.03em] text-ink">
                  {displayName}
                </h1>

                {data && data.parts.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] font-medium text-ink-muted tabular-nums">
                    <span>
                      {data.parts.length === 1
                        ? t("{n} film", { n: data.parts.length })
                        : t("{count} films", { count: data.parts.length })}
                    </span>
                    {data.yearRange && (
                      <>
                        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink-subtle/60" />
                        <span>{data.yearRange}</span>
                      </>
                    )}
                    {data.averageRating && (
                      <>
                        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink-subtle/60" />
                        <span className="inline-flex items-center gap-1 text-ink">
                          <Star size={13} className="fill-amber-400 text-amber-400" />
                          {data.averageRating}
                        </span>
                      </>
                    )}
                    {progress.watchedCount > 0 && (
                      <>
                        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink-subtle/60" />
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${
                            progress.complete
                              ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300"
                              : "border-edge-soft bg-surface/80 text-ink"
                          }`}
                        >
                          <Check size={12} strokeWidth={2.6} />
                          {progress.complete
                            ? t("Saga completed")
                            : t("{watched}/{total} seen", {
                                watched: progress.watchedCount,
                                total: progress.releasedCount,
                              })}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {progress.watchedCount > 0 && (
                  <div className="mt-3.5 max-w-sm">
                    <div
                      role="progressbar"
                      aria-valuenow={progress.watchedCount}
                      aria-valuemin={0}
                      aria-valuemax={progress.releasedCount}
                      aria-label={t("Saga progress")}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          progress.complete ? "bg-emerald-400" : "bg-ink"
                        }`}
                        style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {data?.overview && (
                  <div className="mt-4">
                    <p
                      className={`text-[14.5px] leading-relaxed text-ink-muted sm:text-[15px] ${
                        expandedOverview ? "" : "line-clamp-3"
                      }`}
                    >
                      {data.overview}
                    </p>
                    {overviewLong && (
                      <button
                        type="button"
                        onClick={() => setExpandedOverview((v) => !v)}
                        className="mt-1.5 text-[12.5px] font-medium text-ink/80 transition-colors hover:text-ink"
                      >
                        {expandedOverview ? t("Show less") : t("Read more")}
                      </button>
                    )}
                  </div>
                )}

                {primaryTarget && (
                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openMeta(primaryTarget)}
                      className="mac-primary-button"
                    >
                      <Play size={13.5} fill="currentColor" />
                      <span>
                        {progress.watchedCount > 0 && progress.nextUnwatched
                          ? t("Continue: {title}", { title: primaryTarget.name })
                          : progress.complete
                            ? t("Rewatch from chapter 1")
                            : t("Start saga: {title}", { title: primaryTarget.name })}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Films Section */}
      <div className="mx-auto w-full max-w-[1700px] px-12 pb-20 pt-8 max-sm:px-4">
        {data && data.parts.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-edge-soft/60 pb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">
                {t("Films")}
              </h2>
              <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                {data.parts.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sort pills */}
              <div className="vayra-pill-track" role="group" aria-label={t("Sort films")}>
                {(
                  [
                    { id: "chrono", label: t("Chronological") },
                    { id: "newest", label: t("Newest") },
                    { id: "rating", label: t("Top rated") },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={sort === opt.id}
                    onClick={() => setSort(opt.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                      sort === opt.id
                        ? "bg-elevated text-ink shadow-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="vayra-pill-track" role="group" aria-label={t("Display mode")}>
                <button
                  type="button"
                  aria-pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    layout === "grid"
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>{t("Grid")}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={layout === "timeline"}
                  onClick={() => setLayout("timeline")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    layout === "timeline"
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <List size={13} />
                  <span>{t("Timeline")}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className={gridClass}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-3.5 w-16 animate-pulse rounded bg-elevated/45" />
                <div className="aspect-[2/3] animate-pulse rounded-xl bg-elevated/40" />
              </div>
            ))}
          </div>
        ) : !settings.tmdbKey ? (
          <Notice>
            <p>{t("Add a TMDB key in Settings to browse collections.")}</p>
            <button
              type="button"
              onClick={() => setView("settings")}
              className="mac-primary-button"
            >
              <Settings size={14} />
              <span>{t("Open Settings")}</span>
            </button>
          </Notice>
        ) : failed ? (
          <Notice>
            <p>{t("Couldn't load this collection right now.")}</p>
            <button
              type="button"
              onClick={() => setRetryTick((n) => n + 1)}
              className="mac-secondary-button"
            >
              <RotateCcw size={13.5} />
              <span>{t("Retry")}</span>
            </button>
          </Notice>
        ) : !data || data.parts.length === 0 ? (
          <Notice>
            <p>{t("No films found in this collection.")}</p>
          </Notice>
        ) : layout === "grid" ? (
          <div className={gridClass}>
            {sortedParts.map(({ meta, chapter }) => {
              const upcoming = Boolean(meta.releaseDate && meta.releaseDate > todayIso);
              return (
                <div key={meta.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                    <span>#{String(chapter).padStart(2, "0")}</span>
                    {upcoming ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-edge-soft px-2 py-0.5 text-[10px] text-ink-muted">
                        <Clock size={10} />
                        {meta.releaseInfo ?? t("Upcoming")}
                      </span>
                    ) : meta.releaseInfo ? (
                      <span>{meta.releaseInfo}</span>
                    ) : null}
                  </div>
                  <PickCard meta={meta} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {sortedParts.map(({ meta, chapter }) => (
              <TimelineFilmCard
                key={meta.id}
                meta={meta}
                chapter={chapter}
                upcoming={Boolean(meta.releaseDate && meta.releaseDate > todayIso)}
                watched={isPartWatched(meta.id, meta.type)}
                onOpen={() => openMeta(meta)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function TimelineFilmCard({
  meta,
  chapter,
  upcoming,
  watched,
  onOpen,
}: {
  meta: Meta;
  chapter: number;
  upcoming: boolean;
  watched: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group vayra-surface relative flex w-full items-center gap-4 overflow-hidden p-4 text-start transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-edge hover:bg-elevated/90 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:gap-5 sm:p-5"
    >
      {/* Subtle backdrop atmosphere on trailing edge */}
      {meta.background && (
        <img
          src={meta.background}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-1/2 object-cover opacity-18 [mask-image:linear-gradient(to_left,black,transparent)] transition-opacity duration-300 group-hover:opacity-28 md:block"
        />
      )}

      {/* Chapter index */}
      <span className="hidden w-10 shrink-0 text-center font-display text-[22px] font-semibold tabular-nums text-ink-subtle/60 transition-colors group-hover:text-ink-muted sm:block">
        {String(chapter).padStart(2, "0")}
      </span>

      {/* Poster */}
      <span className="relative h-[102px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-raised ring-1 ring-white/12 sm:h-[116px] sm:w-[78px]">
        {meta.poster ? (
          <img
            src={meta.poster}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-ink-subtle">
            #{chapter}
          </span>
        )}
      </span>

      {/* Film editorial info */}
      <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-ink-subtle sm:hidden">
            #{String(chapter).padStart(2, "0")}
          </span>
          <span className="truncate font-display text-[18px] font-semibold tracking-tight text-ink sm:text-[19px]">
            {meta.name}
          </span>
          {watched && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
              <Check size={10.5} strokeWidth={2.8} />
              {t("Watched")}
            </span>
          )}
          {upcoming && (
            <span className="inline-flex items-center gap-1 rounded-full border border-edge-soft bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-muted">
              <Clock size={10.5} />
              {t("Upcoming")}
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-medium tabular-nums text-ink-muted">
          {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
          {meta.releaseInfo && meta.imdbRating && (
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink-subtle/60" />
          )}
          {meta.imdbRating && (
            <span className="inline-flex items-center gap-1 text-ink">
              <Star size={11.5} className="fill-amber-400 text-amber-400" />
              {meta.imdbRating}
            </span>
          )}
        </span>

        {meta.description && (
          <span className="line-clamp-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-muted">
            {meta.description}
          </span>
        )}
      </span>

      <ChevronRight
        size={18}
        strokeWidth={2}
        className="dir-icon relative z-10 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </button>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="vayra-surface flex flex-col items-center justify-center gap-4 px-6 py-16 text-center text-[14.5px] text-ink-muted">
      {children}
    </div>
  );
}
