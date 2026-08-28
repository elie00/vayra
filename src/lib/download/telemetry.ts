import type { DownloadProgress } from "./video-download";

const MIN_SAMPLE_MS = 350;
const SMOOTHING_WEIGHT = 0.28;
const MIN_ETA_RATE = 1024;
const MAX_ETA_SECONDS = 7 * 24 * 60 * 60;

export type DownloadTelemetry = {
  sampledAtMs: number;
  receivedBytes: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
};

function etaSeconds(progress: DownloadProgress, bytesPerSecond: number | null): number | null {
  if (!progress.totalBytes || !bytesPerSecond || bytesPerSecond < MIN_ETA_RATE) return null;
  const remainingBytes = Math.max(0, progress.totalBytes - progress.receivedBytes);
  if (remainingBytes === 0) return 0;
  return Math.min(MAX_ETA_SECONDS, Math.ceil(remainingBytes / bytesPerSecond));
}

export function nextDownloadTelemetry(
  previous: DownloadTelemetry | null,
  progress: DownloadProgress,
  sampledAtMs: number,
): DownloadTelemetry {
  if (!previous || progress.receivedBytes < previous.receivedBytes) {
    return {
      sampledAtMs,
      receivedBytes: progress.receivedBytes,
      bytesPerSecond: null,
      etaSeconds: null,
    };
  }

  const elapsedMs = sampledAtMs - previous.sampledAtMs;
  if (elapsedMs < MIN_SAMPLE_MS) {
    return {
      ...previous,
      etaSeconds: etaSeconds(progress, previous.bytesPerSecond),
    };
  }

  const deltaBytes = progress.receivedBytes - previous.receivedBytes;
  const instantRate = deltaBytes > 0 ? (deltaBytes * 1000) / elapsedMs : 0;
  const bytesPerSecond = previous.bytesPerSecond == null
    ? instantRate
    : previous.bytesPerSecond * (1 - SMOOTHING_WEIGHT) + instantRate * SMOOTHING_WEIGHT;

  return {
    sampledAtMs,
    receivedBytes: progress.receivedBytes,
    bytesPerSecond,
    etaSeconds: etaSeconds(progress, bytesPerSecond),
  };
}
