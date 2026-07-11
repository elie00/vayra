import { describe, expect, it } from "vitest";
import {
  getCastPositionPrecise,
  getCastPositionSnapshot,
  interpolateCastPosition,
  resetCastCorrection,
  setCastCorrection,
  type CastInterpState,
} from "./cast-interp";

describe("interpolateCastPosition", () => {
  it("returns the base position exactly at the correction instant", () => {
    const state: CastInterpState = { base: 100, at: 5_000, playing: true };
    expect(interpolateCastPosition(state, 5_000)).toBe(100);
  });

  it("advances at 1x while playing", () => {
    const state: CastInterpState = { base: 100, at: 5_000, playing: true };
    expect(interpolateCastPosition(state, 7_500)).toBe(102.5);
  });

  it("does not advance while paused", () => {
    const state: CastInterpState = { base: 100, at: 5_000, playing: false };
    expect(interpolateCastPosition(state, 9_000)).toBe(100);
  });

  it("never goes backwards if the clock jitters before the correction", () => {
    const state: CastInterpState = { base: 100, at: 5_000, playing: true };
    // A monotonic clock should not produce this, but guard against negative drift.
    expect(interpolateCastPosition(state, 4_000)).toBe(100);
  });
});

describe("cast position store precision", () => {
  it("getCastPositionPrecise keeps the fractional part while the snapshot is floored", () => {
    resetCastCorrection();
    // Paused so no interval advances the store: the correction is the live value.
    setCastCorrection(123.4, false);
    // The React snapshot is floored to whole seconds to cap re-renders...
    expect(getCastPositionSnapshot()).toBe(123);
    // ...but out-of-scope consumers (scrobble/resume/room-sync) get the float.
    expect(getCastPositionPrecise()).toBeCloseTo(123.4, 5);
    resetCastCorrection();
  });

  it("getCastPositionPrecise returns 0 after a reset", () => {
    resetCastCorrection();
    expect(getCastPositionPrecise()).toBe(0);
  });
});

describe("cast position store monotonicity across corrections", () => {
  it("a poll correction with a lower position never rewinds the displayed second", () => {
    resetCastCorrection();
    // Paused so the interval never advances: corrections are the only mover.
    setCastCorrection(120, false);
    expect(getCastPositionSnapshot()).toBe(120);
    // A late/jittery poll reports an earlier position — the bar must not rewind.
    setCastCorrection(118, false);
    expect(getCastPositionSnapshot()).toBe(120);
    resetCastCorrection();
  });

  it("an explicit seek is allowed to move the displayed second backwards", () => {
    resetCastCorrection();
    setCastCorrection(120, false);
    expect(getCastPositionSnapshot()).toBe(120);
    // The user seeks back to 30s: this is intentional and must be honoured.
    setCastCorrection(30, false, true);
    expect(getCastPositionSnapshot()).toBe(30);
    resetCastCorrection();
  });
});
