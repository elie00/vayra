import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronRight, Info, Play, Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { closeMetaPreview, useMetaPreview } from "./meta-preview";
import { useSheetDrag } from "./use-sheet-drag";

/**
 * A quick look at a title from a mobile row or grid, as streaming apps do it:
 * poster, facts and synopsis, round Play and watchlist actions, then a row to
 * the full details — instead of leaving the list at the first tap. Mounted
 * once from MobileIntegration.
 */
export function MetaPreviewSheet() {
  const meta = useMetaPreview();
  const t = useT();
  const { openMeta, openPicker } = useView();
  const inWatchlist = useInWatchlist(meta?.id ?? "");
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useSheetDrag(sheetRef, closeMetaPreview, meta !== null);

  useEffect(() => {
    if (!meta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMetaPreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [meta]);

  if (!meta) return null;
  const facts = [meta.releaseInfo, meta.runtime, meta.imdbRating && `IMDb ${meta.imdbRating}`].filter(Boolean);
  const genres = (meta.genres ?? []).slice(0, 3).map((g) => t(g));
  const details = () => {
    closeMetaPreview();
    openMeta(meta);
  };

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={closeMetaPreview}
        className="vayra-scrim absolute inset-0 bg-black/60"
      />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={meta.name}
        data-dragging={drag > 0 ? "" : undefined}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className="vayra-sheet absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-[1.75rem] bg-elevated shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgb(255_255_255/0.06)]"
      >
        <div aria-hidden className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-ink-subtle/40" />
        </div>
        {/* min-h-0, not flex-1: the Android rule that pads `.flex-1.overflow-y-auto`
            scrollers for the tab bar would otherwise pad this sheet too. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[calc(1rem+var(--vayra-safe-bottom))] pt-2">
          <div className="flex gap-4">
            {meta.poster && (
              <img
                src={meta.poster}
                alt=""
                className="aspect-[2/3] w-[5.5rem] shrink-0 rounded-lg object-cover ring-1 ring-white/8"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <h2 className="pe-9 text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink" dir="auto">
                {meta.name}
              </h2>
              {facts.length > 0 && <p className="text-[12.5px] text-ink-subtle">{facts.join(" · ")}</p>}
              {genres.length > 0 && <p className="text-[12.5px] text-ink-muted">{genres.join(" • ")}</p>}
            </div>
            <button
              type="button"
              onClick={closeMetaPreview}
              aria-label={t("common.close")}
              className="absolute end-4 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-raised text-ink-muted transition-transform duration-150 active:scale-90"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
          {meta.description && (
            <p className="mt-4 line-clamp-4 text-[14px] leading-relaxed text-ink-muted" dir="auto">
              {meta.description}
            </p>
          )}
          <div className="mt-5 flex gap-6 px-1">
            {meta.type === "movie" && (
              <RoundAction
                label={t("Play")}
                primary
                onClick={() => {
                  closeMetaPreview();
                  openPicker(meta, undefined, { autoPlay: true, resume: true });
                }}
              >
                <Play size={20} fill="currentColor" className="ms-0.5" />
              </RoundAction>
            )}
            <RoundAction
              label={t("To watch")}
              ariaLabel={inWatchlist ? t("In Watchlist") : t("Add to Watchlist")}
              pressed={inWatchlist}
              onClick={() => toggleWatchlist({ id: meta.id, type: meta.type, name: meta.name, poster: meta.poster })}
            >
              {inWatchlist ? <Check size={20} strokeWidth={2.4} /> : <Plus size={20} strokeWidth={2.2} />}
            </RoundAction>
          </div>
          <button
            type="button"
            onClick={details}
            className="mt-5 flex w-full items-center gap-3 border-t border-white/8 py-3.5 text-start text-[14px] font-medium text-ink transition-opacity active:opacity-60"
          >
            <Info size={18} strokeWidth={2} className="text-ink-muted" />
            <span className="flex-1">{t("Details & more")}</span>
            <ChevronRight size={18} strokeWidth={2} className="dir-icon text-ink-subtle" />
          </button>
        </div>
      </section>
    </div>
  );
}

function RoundAction({
  label,
  ariaLabel,
  primary = false,
  pressed,
  onClick,
  children,
}: {
  label: string;
  ariaLabel?: string;
  primary?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className="group flex w-14 flex-col items-center gap-2 text-[12px] font-medium text-ink-muted"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-150 ease-out group-active:scale-90 ${
          primary ? "bg-ink text-canvas" : "bg-raised text-ink"
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  );
}
