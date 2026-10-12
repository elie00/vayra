import { describe, expect, it } from "vitest";
import { dismissThreshold, nextDragPhase } from "./sheet-drag";

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
