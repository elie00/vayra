/**
 * Pull-down-to-close for mobile sheets. A touch becomes a sheet drag only once it
 * clearly moves down; a sideways move belongs to the content (a row, a carousel)
 * for the rest of the touch, and a list already scrolled down scrolls first.
 */
export type DragPhase = "pending" | "dismissing" | "locked" | "ignored";

const START_PX = 8;
const SIDEWAYS_PX = 10;

export function nextDragPhase(phase: DragPhase, dx: number, dy: number, innerScrolled: boolean): DragPhase {
  if (phase !== "pending") return phase;
  if (Math.abs(dx) > SIDEWAYS_PX && Math.abs(dx) > Math.abs(dy)) return "locked";
  if (dy < START_PX || innerScrolled) return "pending";
  return "dismissing";
}

/** How far a sheet must be pulled to close rather than spring back. */
export function dismissThreshold(sheetHeightPx: number): number {
  return Math.max(100, sheetHeightPx * 0.12);
}

// Vaul's flick speed: a pull released faster than this closes however short it is.
const FLICK_PX_PER_MS = 0.4;

/** Close on a long enough pull, or on a quick flick down. */
export function shouldDismiss(offsetPx: number, sheetHeightPx: number, elapsedMs: number): boolean {
  if (offsetPx > dismissThreshold(sheetHeightPx)) return true;
  return elapsedMs > 0 && offsetPx > START_PX && offsetPx / elapsedMs > FLICK_PX_PER_MS;
}

/** A touch that starts on a slider adjusts the slider, never the sheet. */
export function startsOnSlider(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="slider"], input[type="range"]') !== null;
}

/** True when the touch starts inside a list the user has already scrolled down. */
export function insideScrolledList(target: EventTarget | null, sheet: Element): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== sheet; el = el.parentElement) {
    const { overflowY } = window.getComputedStyle(el);
    const scrollable = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
    if (scrollable && el.scrollTop > 1) return true;
  }
  return false;
}
