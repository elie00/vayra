import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";

export type PlaybackSourceStatus = {
  label: "Preparing download" | "Downloading" | "Download complete" | "Download failed" | "Buffering";
  tone: "info" | "success" | "error";
  progress?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
};

export function formatTransferRate(bytesPerSecond: number): string | null {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 1024) return null;
  if (bytesPerSecond >= 1024 ** 3) return `${(bytesPerSecond / 1024 ** 3).toFixed(1)} GB/s`;
  if (bytesPerSecond >= 1024 ** 2) return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s`;
  return `${Math.round(bytesPerSecond / 1024)} KB/s`;
}

export function formatTransferEta(
  seconds: number,
  translate: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.ceil(seconds);
  if (rounded < 60) return translate("{s}s left", { s: rounded });
  const minutes = Math.ceil(rounded / 60);
  if (minutes < 60) return translate("{m}m left", { m: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? translate("{h}h left", { h: hours })
    : translate("{h}h {m}m left", { h: hours, m: rest });
}

export function playbackSourceStatus(
  snap: Pick<PlayerSnapshot, "buffering">,
  download?: DownloadStatus,
): PlaybackSourceStatus | null {
  if (download?.kind === "error") {
    return { label: "Download failed", tone: "error" };
  }
  if (download?.kind === "preparing") {
    return { label: "Preparing download", tone: "info" };
  }
  if (download?.kind === "downloading") {
    return {
      label: "Downloading",
      tone: "info",
      progress: Math.round(Math.min(1, Math.max(0, download.ratio)) * 100),
      bytesPerSecond: download.bytesPerSecond ?? undefined,
      etaSeconds: download.etaSeconds ?? undefined,
    };
  }
  if (snap.buffering) {
    return { label: "Buffering", tone: "info" };
  }
  if (download?.kind === "done") {
    return { label: "Download complete", tone: "success" };
  }
  return null;
}
