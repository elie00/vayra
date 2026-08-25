import { describe, expect, it } from "vitest";
import { shouldResume } from "./use-playback-controls";

describe("shouldResume", () => {
  it("says pause when playback is actually running", () => {
    expect(shouldResume({ status: "playing", buffering: false })).toBe(false);
  });

  it("says play when the viewer had paused", () => {
    expect(shouldResume({ status: "paused", buffering: false })).toBe(true);
  });

  it("says play while the buffer is refilling", () => {
    // mpv reports itself as playing again the moment the buffer catches up, so a
    // press landing then used to pause the video the viewer was waiting on.
    expect(shouldResume({ status: "playing", buffering: true })).toBe(true);
  });

  it("says play when mpv paused itself for the buffer", () => {
    expect(shouldResume({ status: "paused", buffering: true })).toBe(true);
  });

  it("says play from a stopped or failed player", () => {
    expect(shouldResume({ status: "ended", buffering: false })).toBe(true);
    expect(shouldResume({ status: "error", buffering: false })).toBe(true);
  });
});
