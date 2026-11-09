import { Loader2, RotateCcw, Subtitles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Row, Stepper } from "@/components/player/sub-style-bar/advanced-menu";
import { ColorRow } from "@/components/player/sub-style-bar/controls";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { DEFAULT } from "@/lib/settings/defaults";

const PANEL_WIDTH = 300;
const OUTLINE_SWATCHES = ["#000000", "#3F3F46", "#FFFFFF", "#1E3A8A"] as const;
const SIZE = { min: 16, max: 96, step: 2 };
const HEIGHT = { min: 0, max: 40, step: 1 };
const THICKNESS = { min: 0, max: 8, step: 1 };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Style of the subtitles burned into a cast, set from the cast session bar. */
export function CastSubStyleMenu({ applying, pending }: { applying: boolean; pending: boolean }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = clamp(r.left + r.width / 2 - PANEL_WIDTH / 2, 8, window.innerWidth - PANEL_WIDTH - 8);
      setPos({ top: r.bottom + 12, left });
    };
    place();
    // Capture phase: Escape closes this panel without also leaving the video.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) panelRef.current?.focus();
  }, [open, pos]);

  const size = settings.castSubFontSize;
  const height = settings.castSubMarginY;
  const thickness = settings.castSubBorderSize;
  const status = applying
    ? t("Applying on the TV…")
    : pending
      ? t("Sent to the TV in a moment")
      : t("Each change briefly restarts the video on the TV.");

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("TV subtitles")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("TV subtitles")}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          open ? "bg-canvas/85 text-accent" : "bg-canvas/60 text-ink hover:bg-canvas/85"
        }`}
      >
        {applying ? (
          <Loader2 size={14} strokeWidth={2.2} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Subtitles size={14} strokeWidth={2.2} />
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[310]"
              onMouseDown={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t("TV subtitles")}
              tabIndex={-1}
              className="animate-popover-in fixed z-[320] rounded-[16px] border border-edge bg-elevated p-2 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.8)] outline-none backdrop-blur-md"
              style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            >
              <div className="px-2 pb-2 pt-1">
                <p className="text-[13.5px] font-semibold text-ink">{t("TV subtitles")}</p>
                <p aria-live="polite" className="mt-0.5 text-[11.5px] leading-snug text-ink-subtle">
                  {status}
                </p>
              </div>
              <Row label={t("Size")}>
                <Stepper
                  value={size}
                  decLabel={t("Smaller")}
                  incLabel={t("Larger")}
                  decDisabled={size <= SIZE.min}
                  incDisabled={size >= SIZE.max}
                  onDec={() => update({ castSubFontSize: clamp(size - SIZE.step, SIZE.min, SIZE.max) })}
                  onInc={() => update({ castSubFontSize: clamp(size + SIZE.step, SIZE.min, SIZE.max) })}
                />
              </Row>
              <Row label={t("Height on screen")}>
                <Stepper
                  value={t("{n}%", { n: height })}
                  decLabel={t("Lower subtitles")}
                  incLabel={t("Raise subtitles")}
                  decDisabled={height <= HEIGHT.min}
                  incDisabled={height >= HEIGHT.max}
                  onDec={() => update({ castSubMarginY: clamp(height - HEIGHT.step, HEIGHT.min, HEIGHT.max) })}
                  onInc={() => update({ castSubMarginY: clamp(height + HEIGHT.step, HEIGHT.min, HEIGHT.max) })}
                />
              </Row>
              <p className="px-2 pt-1.5 text-[13.5px] font-medium text-ink-muted">{t("Text color")}</p>
              <ColorRow value={settings.castSubFontColor} onChange={(c) => update({ castSubFontColor: c })} />
              <p className="px-2 pt-1.5 text-[13.5px] font-medium text-ink-muted">{t("Outline color")}</p>
              <ColorRow
                value={settings.castSubBorderColor}
                onChange={(c) => update({ castSubBorderColor: c })}
                swatches={OUTLINE_SWATCHES}
                swatchLabel={(c) => t("Outline color {color}", { color: c })}
              />
              <Row label={t("Outline thickness")}>
                <Stepper
                  value={thickness}
                  decLabel={t("Thinner outline")}
                  incLabel={t("Thicker outline")}
                  decDisabled={thickness <= THICKNESS.min}
                  incDisabled={thickness >= THICKNESS.max}
                  onDec={() => update({ castSubBorderSize: clamp(thickness - THICKNESS.step, THICKNESS.min, THICKNESS.max) })}
                  onInc={() => update({ castSubBorderSize: clamp(thickness + THICKNESS.step, THICKNESS.min, THICKNESS.max) })}
                />
              </Row>
              <div className="my-1.5 h-px bg-edge-soft" />
              <button
                type="button"
                onClick={() =>
                  update({
                    castSubFontSize: DEFAULT.castSubFontSize,
                    castSubMarginY: DEFAULT.castSubMarginY,
                    castSubFontColor: DEFAULT.castSubFontColor,
                    castSubBorderColor: DEFAULT.castSubBorderColor,
                    castSubBorderSize: DEFAULT.castSubBorderSize,
                  })
                }
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-start text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <RotateCcw size={13} strokeWidth={2.2} />
                {t("Reset to defaults")}
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
