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

  // The loader waits for the first frame. mpv often reports duration, size and
  // gamma before it, so the first frame used to be the only change and the
  // loader stayed over the playing video.
  it("publishes the first rendered frame on its own", () => {
    const playing = { ...emptySnapshot, status: "playing" as const, durationSec: 120, rendered: false };
    expect(snapChangedIgnoringClock(playing, { ...playing, rendered: true })).toBe(true);
  });

  it("publishes reconnection, missing audio and picture-in-picture changes", () => {
    const playing = { ...emptySnapshot, status: "playing" as const };
    expect(snapChangedIgnoringClock(playing, { ...playing, resumeRecovery: "reconnecting" })).toBe(true);
    expect(snapChangedIgnoringClock(playing, { ...playing, noAudio: true })).toBe(true);
    expect(snapChangedIgnoringClock(playing, { ...playing, pip: true })).toBe(true);
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
