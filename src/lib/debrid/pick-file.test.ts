import { describe, expect, it } from "vitest";
import { canFallBackToLargest } from "./pick-file";

describe("canFallBackToLargest", () => {
  it("takes the largest file for a movie", () => {
    expect(canFallBackToLargest(undefined, 4)).toBe(true);
  });

  it("takes the only file there is, episode or not", () => {
    expect(canFallBackToLargest({ season: 1, episode: 2 }, 1)).toBe(true);
    expect(canFallBackToLargest(undefined, 1)).toBe(true);
    expect(canFallBackToLargest({ season: 1, episode: 2 }, 0)).toBe(true);
  });

  it("refuses to guess an episode out of a pack", () => {
    // The largest file is simply some other episode.
    expect(canFallBackToLargest({ season: 1, episode: 2 }, 12)).toBe(false);
  });

  it("treats a hint with no episode as no hint at all", () => {
    expect(canFallBackToLargest({ season: 1, episode: null }, 12)).toBe(true);
  });
});
