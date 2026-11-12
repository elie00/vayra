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
// Released while moving back up faster than this, the sheet stays open.
const RETREAT_PX_PER_MS = 0.1;

/** Close on a long enough pull or a quick flick down, unless the finger was carrying the sheet back up. */
export function shouldDismiss(offsetPx: number, sheetHeightPx: number, velocityPxPerMs: number): boolean {
  if (velocityPxPerMs < -RETREAT_PX_PER_MS) return false;
  if (offsetPx > dismissThreshold(sheetHeightPx)) return true;
  return offsetPx > START_PX && velocityPxPerMs > FLICK_PX_PER_MS;
}

export type DragSample = { y: number; t: number };

const VELOCITY_WINDOW_MS = 100;

/**
 * Downward speed in px/ms as the finger lifts: over the last 100 ms of the pull,
 * so a slow drag ended by a flick counts as a flick, and a finger that rested
 * before lifting counts as still.
 */
export function releaseVelocity(samples: DragSample[], nowMs: number): number {
  const last = samples[samples.length - 1];
  if (!last || nowMs - last.t > VELOCITY_WINDOW_MS) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last;
  return last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
}

const RUBBER_MAX_PX = 32;
const RUBBER_REACH_PX = 160;

/** A pull down moves the sheet 1:1; a pull up meets growing resistance instead of a wall. */
export function rubberBand(dy: number): number {
  if (dy >= 0) return dy;
  return -RUBBER_MAX_PX * (1 - RUBBER_REACH_PX / (RUBBER_REACH_PX - dy));
}

/** The scrim is exactly as faded as the sheet is pulled away. */
export function scrimOpacity(offsetPx: number, sheetHeightPx: number): number {
  if (sheetHeightPx <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - offsetPx / sheetHeightPx));
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
