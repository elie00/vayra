import { describe, expect, it } from "vitest";
import {
  HARD_DRIFT,
  SOFT_DRIFT,
  driftAction,
  extrapolateTarget,
  shouldApply,
} from "./reconcile";
import type { PlaybackState } from "./types";

const THRESHOLDS = { soft: SOFT_DRIFT, hard: HARD_DRIFT };

function state(over: Partial<PlaybackState> = {}): PlaybackState {
  return {
    rev: 1,
    playing: true,
    positionSec: 100,
    rate: 1,
    buffering: false,
    ended: false,
    anchorAtMs: 10_000,
    updatedBy: "host",
    hostClientId: "host",
    ...over,
  };
}

describe("shouldApply (rev LWW)", () => {
  it("applies strictly newer revs", () => {
    expect(shouldApply(5, 4)).toBe(true);
  });
  it("drops equal rev (idempotent no-op)", () => {
    expect(shouldApply(4, 4)).toBe(false);
  });
  it("drops stale rev (non-decreasing invariant)", () => {
    expect(shouldApply(3, 4)).toBe(false);
  });
});

describe("extrapolateTarget", () => {
  it("advances by elapsed * rate while playing", () => {
    const s = state({ positionSec: 100, rate: 2, anchorAtMs: 1000 });
    // 500ms elapsed at rate 2 => +1s
    expect(extrapolateTarget(s, 1500)).toBeCloseTo(101, 6);
  });
  it("does not advance when paused", () => {
    const s = state({ playing: false, positionSec: 100, anchorAtMs: 1000 });
    expect(extrapolateTarget(s, 5000)).toBe(100);
  });
  it("freezes advancement when host is buffering", () => {
    const s = state({ playing: true, buffering: true, positionSec: 100, anchorAtMs: 1000 });
    expect(extrapolateTarget(s, 5000)).toBe(100);
  });
});

describe("driftAction buckets", () => {
  it("none below soft threshold", () => {
    expect(driftAction(100, 100.5, THRESHOLDS, false)).toBe("none");
  });
  it("boundary: exactly soft (0.75) is soft, not none", () => {
    expect(driftAction(100.75, 100, THRESHOLDS, false)).toBe("soft");
  });
  it("soft in [0.75, 2.0)", () => {
    expect(driftAction(101, 100, THRESHOLDS, false)).toBe("soft");
  });
  it("boundary: exactly hard (2.0) is hard", () => {
    expect(driftAction(102, 100, THRESHOLDS, false)).toBe("hard");
  });
  it("hard beyond hard threshold, either sign", () => {
    expect(driftAction(105, 100, THRESHOLDS, false)).toBe("hard");
    expect(driftAction(95, 100, THRESHOLDS, false)).toBe("hard");
  });
  it("buffering suspends regardless of drift", () => {
    expect(driftAction(200, 100, THRESHOLDS, true)).toBe("suspend");
    expect(driftAction(100, 100, THRESHOLDS, true)).toBe("suspend");
  });
});
