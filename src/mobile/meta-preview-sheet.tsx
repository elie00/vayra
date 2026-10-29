import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { closeMetaPreview, useMetaPreview } from "./meta-preview";
import { useSheetDrag } from "./use-sheet-drag";

/**
 * A quick look at a title from a mobile row or grid: poster, genres and synopsis,
 * with Play and Details, instead of leaving the list at the first tap. Mounted
 * once from MobileIntegration.
 */
export function MetaPreviewSheet() {
  const meta = useMetaPreview();
  const t = useT();
  const { openMeta, openPicker } = useView();
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

  return (
    <div className="fixed inset-0 z-[130]">
      <button type="button" aria-label={t("common.close")} onClick={closeMetaPreview} className="absolute inset-0 bg-black/55" />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={meta.name}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-3xl bg-canvas ring-1 ring-edge-soft/70 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)]"
      >
        <div aria-hidden className="flex shrink-0 justify-center pb-1 pt-3">
          <span className="h-1.5 w-11 rounded-full bg-ink-subtle/40" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+var(--vayra-safe-bottom))] pt-2">
          <div className="flex gap-4">
            {meta.poster && (
              <img src={meta.poster} alt="" className="aspect-[2/3] w-24 shrink-0 rounded-xl object-cover" />
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="text-[20px] font-semibold leading-tight text-ink" dir="auto">{meta.name}</h2>
              {facts.length > 0 && <p className="text-[12.5px] text-ink-subtle">{facts.join(" · ")}</p>}
              {meta.genres && meta.genres.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {meta.genres.slice(0, 4).map((g) => (
                    <span key={g} className="rounded-full bg-elevated px-2.5 py-1 text-[11.5px] text-ink-muted">{g}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {meta.description && (
            <p className="mt-4 line-clamp-6 text-[14px] leading-relaxed text-ink-muted" dir="auto">{meta.description}</p>
          )}
          <div className="mt-5 flex gap-2.5">
            {meta.type === "movie" && (
              <button
                type="button"
                onClick={() => {
                  closeMetaPreview();
                  openPicker(meta, undefined, { autoPlay: true, resume: true });
                }}
                className="flex h-12 flex-1 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-canvas"
              >
                {t("Play")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                closeMetaPreview();
                openMeta(meta);
              }}
              className="flex h-12 flex-1 items-center justify-center rounded-full border border-edge-soft bg-elevated/70 text-[15px] font-semibold text-ink"
            >
              {t("Details")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
