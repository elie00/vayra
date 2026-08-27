import { describe, expect, it } from "vitest";
import { emptySnapshot } from "@/lib/player/bridge";
import { snapChangedIgnoringClock } from "./player-snapshot";

describe("snapChangedIgnoringClock", () => {
  it("publishes the end of mpv cache buffering while playback stays paused", () => {
    const pausedWhileDownloading = {
      ...emptySnapshot,
      status: "paused" as const,
      buffering: true,
    };
    const pausedAfterDownload = {
      ...pausedWhileDownloading,
      buffering: false,
    };

    expect(snapChangedIgnoringClock(pausedWhileDownloading, pausedAfterDownload)).toBe(true);
  });

  it("still ignores clock-only progress", () => {
    expect(
      snapChangedIgnoringClock(
        { ...emptySnapshot, positionSec: 12, bufferedSec: 30 },
        { ...emptySnapshot, positionSec: 13, bufferedSec: 31 },
      ),
    ).toBe(false);
  });
});
