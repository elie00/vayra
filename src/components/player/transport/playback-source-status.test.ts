import { describe, expect, it } from "vitest";
import { playbackSourceStatus } from "./playback-source-status";

describe("playback source status", () => {
  it("reports and clamps download progress", () => {
    expect(
      playbackSourceStatus(
        { buffering: false },
        { kind: "downloading", ratio: 1.4, receivedBytes: 10, totalBytes: 10 },
      ),
    ).toEqual({ label: "Downloading", tone: "info", progress: 100 });
  });

  it("shows buffering before a completed download", () => {
    expect(
      playbackSourceStatus(
        { buffering: true },
        { kind: "done", path: "/tmp/episode.mkv" },
      ),
    ).toEqual({ label: "Buffering", tone: "info" });
  });

  it("keeps download completion visible while paused", () => {
    expect(
      playbackSourceStatus(
        { buffering: false },
        { kind: "done", path: "/tmp/episode.mkv" },
      ),
    ).toEqual({ label: "Download complete", tone: "success" });
  });
});
