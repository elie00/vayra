import { useSyncExternalStore } from "react";

/**
 * Local interpolation for the cast position between real status corrections.
 *
 * The cast device is polled ~1 Hz. Rather than storing that position in React
 * state (which re-renders the whole player subtree each tick), we keep the last
 * confirmed status in a ref and interpolate forward from it so the progress bar
 * can advance smoothly while only the bar re-renders.
 */
export type CastInterpState = {
  /** Last position confirmed by a real cast status tick, in seconds. */
  base: number;
  /** performance.now()/Date.now() timestamp when `base` was captured, in ms. */
  at: number;
  /** Whether the cast device is currently playing (advancing). */
  playing: boolean;
};

/**
 * Position at `nowMs` = base + elapsed while playing, clamped so a clock jitter
 * before the correction instant never rewinds the bar.
 */
export function interpolateCastPosition(state: CastInterpState, nowMs: number): number {
  if (!state.playing) return state.base;
  const elapsedSec = (nowMs - state.at) / 1000;
  if (elapsedSec <= 0) return state.base;
  return state.base + elapsedSec;
}

/**
 * Ref-based store for the cast position, subscribed to only by the cast session
 * bar. Keeping this out of React state means a status tick no longer re-renders
 * the whole player subtree — only the bar redraws.
 *
 * The store is corrected by real cast status ticks (`setCastCorrection`) and
 * advanced smoothly between them by a self-driven interval while playing.
 */
let interp: CastInterpState = { base: 0, at: 0, playing: false };
let displayedSec = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Recompute the floored display value and notify subscribers if it changed.
 *
 * `allowRewind` is false on every path except an explicit user seek: a poll
 * tick that reports a *lower* position than what's already shown (a late or
 * jittery status response, buffering, device clock drift) must not rewind the
 * bar. Only an intentional seek is permitted to move the displayed second
 * backwards.
 */
function emit(allowRewind: boolean): void {
  const next = Math.floor(interpolateCastPosition(interp, nowMs()));
  if (next === displayedSec) return;
  if (!allowRewind && next < displayedSec) return;
  displayedSec = next;
  for (const l of listeners) l();
}

function ensureTimer(): void {
  if (timer != null || listeners.size === 0 || !interp.playing) return;
  // 250ms keeps the bar visibly moving without a rAF loop; the value is still
  // floored to whole seconds so this fires at most one re-render per second.
  // The interval only ever advances (playing == true), so it never rewinds.
  timer = setInterval(() => emit(false), 250);
}

function stopTimer(): void {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Correct the store from a real cast status tick.
 *
 * `seek` marks an intentional position change (the user scrubbed) and is the
 * only case allowed to rewind the displayed second; poll corrections keep the
 * bar monotonic so a late/jittery status response never makes it jump back.
 */
export function setCastCorrection(base: number, playing: boolean, seek = false): void {
  interp = { base, at: nowMs(), playing };
  emit(seek);
  if (playing) ensureTimer();
  else stopTimer();
}

/** Reset the store when a cast session ends. */
export function resetCastCorrection(): void {
  interp = { base: 0, at: 0, playing: false };
  displayedSec = 0;
  stopTimer();
  for (const l of listeners) l();
}

export function subscribeCastPosition(cb: () => void): () => void {
  listeners.add(cb);
  ensureTimer();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopTimer();
  };
}

export function getCastPositionSnapshot(): number {
  return displayedSec;
}

/**
 * Live interpolated position as a float, without the whole-second flooring used
 * for `displayedSec`. Consumers that need sub-second precision — scrobbling,
 * resume autosave, room sync via the playback clock — read this instead of the
 * floored `getCastPositionSnapshot()` snapshot.
 */
export function getCastPositionPrecise(): number {
  return interpolateCastPosition(interp, nowMs());
}

export function useCastPosition(): number {
  return useSyncExternalStore(
    subscribeCastPosition,
    getCastPositionSnapshot,
    getCastPositionSnapshot,
  );
}
