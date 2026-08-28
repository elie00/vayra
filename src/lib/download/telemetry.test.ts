import { describe, expect, it } from "vitest";
import { nextDownloadTelemetry } from "./telemetry";

describe("download telemetry", () => {
  it("derives a stable rate and ETA after the first sample", () => {
    const first = nextDownloadTelemetry(
      null,
      { ratio: 0.1, receivedBytes: 10_000_000, totalBytes: 100_000_000 },
      1_000,
    );
    const second = nextDownloadTelemetry(
      first,
      { ratio: 0.2, receivedBytes: 20_000_000, totalBytes: 100_000_000 },
      2_000,
    );

    expect(second.bytesPerSecond).toBe(10_000_000);
    expect(second.etaSeconds).toBe(8);
  });

  it("keeps the previous rate when progress events are too close", () => {
    const previous = {
      sampledAtMs: 1_000,
      receivedBytes: 20_000,
      bytesPerSecond: 5_000,
      etaSeconds: 16,
    };
    const next = nextDownloadTelemetry(
      previous,
      { ratio: 0.25, receivedBytes: 25_000, totalBytes: 100_000 },
      1_100,
    );

    expect(next.sampledAtMs).toBe(1_000);
    expect(next.bytesPerSecond).toBe(5_000);
    expect(next.etaSeconds).toBe(15);
  });

  it("resets when a resumed download reports fewer bytes", () => {
    const next = nextDownloadTelemetry(
      { sampledAtMs: 1_000, receivedBytes: 50_000, bytesPerSecond: 4_000, etaSeconds: 10 },
      { ratio: 0.1, receivedBytes: 10_000, totalBytes: 100_000 },
      2_000,
    );

    expect(next.bytesPerSecond).toBeNull();
    expect(next.etaSeconds).toBeNull();
  });
});
