import { useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Loader2, Play, RefreshCw } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { getUiLanguage, useT } from "@/lib/i18n";
import type { ScoredStream } from "@/lib/streams/types";
import type { PlayEpisode } from "@/lib/view";
import { BackdropLayer } from "@/views/play-picker/backdrop-layer";
import { QUALITY_ORDER, sourceFacts, sourceFeatures, sourceQuality, type SourceQuality } from "./source-summary";

// The phone's source picker, as a sheet: the best source first with one Play
// button, quality filters, then the other sources in plain words — quality,
// picture and sound, size, cached or peers, addon — instead of release names.
// Rendered from PlayPicker, which keeps the pipeline, auto-play, the pick
// handler and every modal; this only shows what it computed.

type Filters = {
  cachedOnly: boolean;
  onToggleCached?: () => void;
  langOn: boolean;
  onToggleLang?: () => void;
};

export function MobilePlayPicker({
  meta,
  episode,
  onBack,
  onRefresh,
  refreshing,
  backdropSrc,
  best,
  streams,
  searching,
  stillSearching,
  failedStreams,
  resolving,
  onPlay,
  isDownload,
  notices,
  empty,
  resolveError,
  engineWarming,
  filters,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  backdropSrc?: string;
  best: ScoredStream | null;
  streams: ScoredStream[];
  /** Nothing found yet and the pipeline is still running. */
  searching: boolean;
  /** Addons that have not answered yet. */
  stillSearching: number;
  failedStreams: Map<ScoredStream, string>;
  resolving: ScoredStream | null;
  onPlay: (stream: ScoredStream) => void;
  isDownload: boolean;
  notices: ReactNode;
  empty: ReactNode;
  resolveError: string | null;
  engineWarming: boolean;
  filters: Filters;
}) {
  const t = useT();
  const locale = getUiLanguage();
  const [quality, setQuality] = useState<SourceQuality | "all">("all");
  const title = episode ? episode.name || t("Episode {n}", { n: episode.episode }) : meta.name;
  const eyebrow = episode
    ? `${meta.name} · S${episode.imdbSeason ?? episode.season}E${String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}`
    : meta.releaseInfo || "";

  const counts = useMemo(() => {
    const out = new Map<SourceQuality, number>();
    for (const s of streams) out.set(sourceQuality(s), (out.get(sourceQuality(s)) ?? 0) + 1);
    return out;
  }, [streams]);
  const shown = streams.filter((s) => (quality === "all" ? s !== best : sourceQuality(s) === quality));
  const drag = useHandleDrag(onBack);
  const bestFailure = best ? failedStreams.get(best) : undefined;

  return (
    <main className="absolute inset-0 z-50 overflow-hidden bg-black/40">
      <BackdropLayer src={backdropSrc} />
      <button type="button" aria-label={t("common.back")} onClick={onBack} className="absolute inset-x-0 top-0 h-[12vh] w-full" />

      <section
        data-dragging={drag.offset > 0 ? "" : undefined}
        style={drag.offset > 0 ? { transform: `translateY(${drag.offset}px)` } : undefined}
        className="vayra-sheet absolute inset-x-0 bottom-0 top-[10vh] flex flex-col rounded-t-[1.75rem] bg-canvas shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgb(255_255_255/0.06)]"
      >
        <div {...drag.handlers} className="flex shrink-0 touch-none justify-center pb-1 pt-2.5">
          <span className="h-1 w-8 rounded-full bg-ink-subtle/40" />
        </div>

        <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-1">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="truncate type-caption font-semibold uppercase tracking-[0.18em] text-ink-subtle">{eyebrow}</p>}
            <h1 className="truncate type-title-2 font-semibold text-ink" dir="auto">{title}</h1>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={t("Refresh sources")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-elevated text-ink-muted transition-transform active:scale-95 disabled:opacity-60"
          >
            <RefreshCw size={17} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
          </button>
        </header>

        {/* grow + basis-0 rather than flex-1, which the Android tab-bar padding rule targets. */}
        <div className="min-h-0 grow basis-0 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+var(--vayra-safe-bottom))]">
          <div className="flex flex-col gap-4">
            {notices}

            {searching && <Searching />}

            {best && (
              <section className="flex flex-col gap-3 rounded-2xl bg-elevated p-4 ring-1 ring-edge-soft/50">
                <p className="type-caption font-semibold uppercase tracking-[0.18em] text-ink-subtle">{t("Best source")}</p>
                <div className="flex items-center gap-3">
                  <QualityBadge quality={sourceQuality(best)} large />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 type-title-3 font-semibold text-ink">{headline(best, t, locale).join(" · ")}</p>
                    <p className="truncate type-footnote text-ink-muted">{sourceFacts(best, t, locale).join(" · ")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPlay(best)}
                  disabled={resolving === best}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-ink type-callout font-semibold text-canvas transition-transform active:scale-[0.98] disabled:opacity-70"
                >
                  {resolving === best ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : isDownload ? (
                    <Download size={18} strokeWidth={2.2} />
                  ) : (
                    <Play size={18} fill="currentColor" />
                  )}
                  {isDownload ? t("Download") : t("Play")}
                </button>
                {bestFailure && <p className="type-caption text-danger">{t("Didn't play: {reason}", { reason: bestFailure })}</p>}
              </section>
            )}

            {streams.length > 1 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Chip on={quality === "all"} onClick={() => setQuality("all")} label={t("All")} count={streams.length} />
                {QUALITY_ORDER.filter((q) => counts.get(q)).map((q) => (
                  <Chip key={q} on={quality === q} onClick={() => setQuality(q)} label={q} count={counts.get(q)} />
                ))}
                {filters.onToggleCached && <Chip on={filters.cachedOnly} onClick={filters.onToggleCached} label={t("Cached only")} />}
                {filters.onToggleLang && <Chip on={filters.langOn} onClick={filters.onToggleLang} label={t("My languages")} />}
              </div>
            )}

            {shown.length > 0 && (
              <section className="flex flex-col gap-2">
                {quality === "all" && <h2 className="type-title-3 font-semibold text-ink">{t("Other sources")}</h2>}
                <div className="flex flex-col divide-y divide-white/6 overflow-hidden rounded-2xl bg-elevated">
                  {shown.map((s, i) => (
                    <SourceRow
                      key={`${s.url ?? s.infoHash ?? ""}-${i}`}
                      stream={s}
                      failure={failedStreams.get(s) ?? null}
                      resolving={resolving === s}
                      onPlay={() => onPlay(s)}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            )}

            {stillSearching > 0 && streams.length > 0 && (
              <p className="flex items-center gap-2 type-footnote text-ink-subtle">
                <Loader2 size={14} className="animate-spin" />
                {t("Still asking {n} addons…", { n: stillSearching })}
              </p>
            )}

            {empty}

            {resolveError && (
              <p
                role="alert"
                className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 type-footnote ${engineWarming ? "bg-elevated text-ink-muted" : "bg-danger/15 text-ink"}`}
              >
                {engineWarming && <Loader2 size={15} className="shrink-0 animate-spin" />}
                {resolveError}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

type T = ReturnType<typeof useT>;

/** Release kind (WEB-DL, BluRay…) then picture, sound and languages. */
function headline(s: ScoredStream, t: T, locale: string): string[] {
  const kind = s.source && s.source !== "Other" ? [s.source] : [];
  const parts = [...kind, ...sourceFeatures(s, t, locale)];
  return parts.length > 0 ? parts : [t("Standard")];
}

function SourceRow({
  stream,
  failure,
  resolving,
  onPlay,
  locale,
}: {
  stream: ScoredStream;
  failure: string | null;
  resolving: boolean;
  onPlay: () => void;
  locale: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={resolving}
      className={`flex w-full items-center gap-3 px-3 py-3 text-start transition-colors active:bg-raised/70 ${failure ? "bg-danger/5" : ""}`}
    >
      <QualityBadge quality={sourceQuality(stream)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate type-callout font-semibold text-ink">{headline(stream, t, locale).join(" · ")}</span>
        <span className="truncate type-footnote text-ink-subtle">{sourceFacts(stream, t, locale).join(" · ")}</span>
        {failure && <span className="type-caption text-danger">{t("Didn't play: {reason}", { reason: failure })}</span>}
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/20 text-ink">
        {resolving ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} fill="currentColor" className="ms-0.5" />}
      </span>
    </button>
  );
}

function QualityBadge({ quality, large = false }: { quality: SourceQuality; large?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight ${
        large ? "h-12 w-14 bg-ink type-callout text-canvas" : "h-10 w-12 bg-raised type-footnote text-ink"
      }`}
    >
      {quality}
    </span>
  );
}

function Chip({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 type-footnote font-semibold transition-colors active:scale-95 ${
        on ? "bg-ink text-canvas" : "border border-ink/20 text-ink"
      }`}
    >
      {label}
      {count != null && <span className="tabular-nums opacity-60">{count}</span>}
    </button>
  );
}

function Searching() {
  const t = useT();
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="flex items-center gap-2 type-footnote text-ink-muted">
        <Loader2 size={15} className="animate-spin" />
        {t("Looking for sources…")}
      </p>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-16 animate-pulse rounded-2xl bg-elevated" />
      ))}
    </div>
  );
}

// Pull the handle down to close: a long pull or a flick, like the other sheets.
function useHandleDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ y: number; at: number } | null>(null);
  return {
    offset,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        start.current = { y: e.clientY, at: e.timeStamp };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current) setOffset(Math.max(0, e.clientY - start.current.y));
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = start.current;
        start.current = null;
        const pulled = s ? e.clientY - s.y : 0;
        const flick = s ? pulled / Math.max(1, e.timeStamp - s.at) > 0.4 : false;
        setOffset(0);
        if (pulled > 90 || (pulled > 8 && flick)) onClose();
      },
    },
  };
}
