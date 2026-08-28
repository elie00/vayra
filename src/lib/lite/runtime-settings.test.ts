import { describe, expect, it } from "vitest";
import {
  applyLiteRuntimeSettings,
  shouldRevealLiteSourceFallback,
} from "./runtime-settings";

describe("VAYRA Lite runtime", () => {
  it("makes the primary play action automatic without mutating saved preferences", () => {
    const saved = { instantPlay: false, seasonSourceLock: true, theme: "noir" };
    const runtime = applyLiteRuntimeSettings(saved, true);

    expect(runtime).toEqual({ instantPlay: true, seasonSourceLock: false, theme: "noir" });
    expect(saved).toEqual({ instantPlay: false, seasonSourceLock: true, theme: "noir" });
  });

  it("leaves native playback preferences untouched", () => {
    const saved = { instantPlay: false, seasonSourceLock: true };
    expect(applyLiteRuntimeSettings(saved, false)).toBe(saved);
  });

  it("reveals provider choices when Lite has availability links but no direct candidate", () => {
    expect(shouldRevealLiteSourceFallback(true, 2, 0)).toBe(true);
    expect(shouldRevealLiteSourceFallback(true, 0, 0)).toBe(false);
    expect(shouldRevealLiteSourceFallback(false, 2, 0)).toBe(false);
  });
});
