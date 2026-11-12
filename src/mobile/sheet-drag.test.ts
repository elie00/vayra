import { describe, expect, it } from "vitest";
import { dismissThreshold, nextDragPhase, releaseVelocity, rubberBand, scrimOpacity, shouldDismiss } from "./sheet-drag";

describe("nextDragPhase", () => {
  it("waits for a clear downward pull before dragging the sheet", () => {
    expect(nextDragPhase("pending", 0, 5, false)).toBe("pending");
    expect(nextDragPhase("pending", 2, 12, false)).toBe("dismissing");
  });

  it("leaves a sideways gesture to the content, for good", () => {
    expect(nextDragPhase("pending", 14, 6, false)).toBe("locked");
    expect(nextDragPhase("locked", 0, 80, false)).toBe("locked");
  });

  it("lets a scrolled list scroll back up instead of closing the sheet", () => {
    expect(nextDragPhase("pending", 0, 40, true)).toBe("pending");
  });

  it("keeps dragging once started, even back above the start", () => {
    expect(nextDragPhase("dismissing", 0, -20, false)).toBe("dismissing");
  });

  it("never starts when the touch began on a slider", () => {
    expect(nextDragPhase("ignored", 0, 80, false)).toBe("ignored");
  });
});

describe("dismissThreshold", () => {
  it("is 100 px, or 12 % of a tall sheet", () => {
    expect(dismissThreshold(500)).toBe(100);
    expect(dismissThreshold(1000)).toBe(120);
  });
});

describe("releaseVelocity", () => {
  it("measures the speed at the moment of release, not over the whole pull", () => {
    // A slow 40 px pull over a second, ended by a 40 px flick in 50 ms.
    const samples = [{ y: 0, t: 0 }, { y: 20, t: 500 }, { y: 40, t: 1000 }, { y: 80, t: 1050 }];
    expect(releaseVelocity(samples, 1050)).toBeCloseTo(0.8);
  });

  it("is zero when the finger rested before lifting", () => {
    const samples = [{ y: 0, t: 0 }, { y: 90, t: 100 }];
    expect(releaseVelocity(samples, 600)).toBe(0);
  });

  it("is negative when the finger was moving back up", () => {
    const samples = [{ y: 200, t: 0 }, { y: 150, t: 50 }];
    expect(releaseVelocity(samples, 50)).toBe(-1);
  });
});

describe("shouldDismiss", () => {
  it("closes on a pull past the threshold, however slow", () => {
    expect(shouldDismiss(130, 600, 0)).toBe(true);
    expect(shouldDismiss(60, 600, 0)).toBe(false);
  });

  it("closes on a quick flick shorter than the threshold", () => {
    expect(shouldDismiss(60, 600, 0.6)).toBe(true);
  });

  it("ignores a twitch, even a fast one", () => {
    expect(shouldDismiss(6, 600, 1.2)).toBe(false);
  });

  it("stays open when the finger was carrying the sheet back up", () => {
    expect(shouldDismiss(200, 600, -0.3)).toBe(false);
  });
});

describe("rubberBand", () => {
  it("follows a downward pull 1:1", () => {
    expect(rubberBand(120)).toBe(120);
  });

  it("resists an upward pull more and more, never past 32 px", () => {
    expect(rubberBand(-10)).toBeLessThan(0);
    expect(rubberBand(-10)).toBeGreaterThan(-10);
    expect(rubberBand(-100) - rubberBand(-200)).toBeLessThan(rubberBand(0) - rubberBand(-100));
    expect(rubberBand(-5000)).toBeGreaterThan(-32);
  });
});

describe("scrimOpacity", () => {
  it("fades the scrim as far as the sheet is pulled", () => {
    expect(scrimOpacity(0, 400)).toBe(1);
    expect(scrimOpacity(100, 400)).toBe(0.75);
    expect(scrimOpacity(900, 400)).toBe(0);
    expect(scrimOpacity(-20, 400)).toBe(1);
  });
});
