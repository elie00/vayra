import { describe, expect, it } from "vitest";
import {
  formatTransferEta,
  formatTransferRate,
  playbackSourceStatus,
} from "./playback-source-status";

describe("playback source status", () => {
  it("reports and clamps download progress", () => {
    expect(
      playbackSourceStatus(
        { buffering: false },
        { kind: "downloading", ratio: 1.4, receivedBytes: 10, totalBytes: 10 },
      ),
    ).toEqual({ label: "Downloading", tone: "info", progress: 100 });
  });

  it("carries download telemetry into the visible status", () => {
    expect(
      playbackSourceStatus(
        { buffering: false },
        {
          kind: "downloading",
          ratio: 0.42,
          receivedBytes: 42,
          totalBytes: 100,
          bytesPerSecond: 8 * 1024 ** 2,
          etaSeconds: 75,
        },
      ),
    ).toMatchObject({ progress: 42, bytesPerSecond: 8 * 1024 ** 2, etaSeconds: 75 });
  });

  it("formats transfer telemetry without noisy low-speed values", () => {
    const translate = (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key);

    expect(formatTransferRate(900)).toBeNull();
    expect(formatTransferRate(8 * 1024 ** 2)).toBe("8.0 MB/s");
    expect(formatTransferEta(75, translate)).toBe("2m left");
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
