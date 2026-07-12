// Pure position-reconciliation logic (§3.5). No side effects, no imports from
// player/, tauri, or DOM. All functions are deterministic given their inputs
// (nowMs is passed in, never read from Date.now here).

import type { PlaybackState } from "./types";

export const SOFT_DRIFT = 0.75;
export const HARD_DRIFT = 2.0;

export interface DriftThresholds {
  soft: number;
  hard: number;
}

export type DriftAction = "none" | "soft" | "hard" | "suspend";

// Rev last-writer-wins (§3.3): apply only strictly-newer revisions.
// Guest invariant: appliedRev is non-decreasing.
export function shouldApply(incomingRev: number, appliedRev: number): boolean {
  return incomingRev > appliedRev;
}

// Extrapolated authority position (§3.5). While the host is buffering, target
// advancement freezes (treat as paused) so guests don't run ahead of a stall.
export function extrapolateTarget(state: PlaybackState, nowMs: number): number {
  const advancing = state.playing && !state.buffering;
  if (!advancing) return state.positionSec;
  const elapsedSec = (nowMs - state.anchorAtMs) / 1000;
  return state.positionSec + elapsedSec * state.rate;
}

// Bucketed correction decision (§3.5). Local buffering suspends correction and
// never seeks. Otherwise: below soft = none, [soft,hard) = soft, >=hard = hard.
export function driftAction(
  localPos: number,
  target: number,
  thresholds: DriftThresholds,
  buffering: boolean,
): DriftAction {
  if (buffering) return "suspend";
  const drift = Math.abs(localPos - target);
  if (drift < thresholds.soft) return "none";
  if (drift < thresholds.hard) return "soft";
  return "hard";
}
