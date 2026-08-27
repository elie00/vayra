import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";

export type PlaybackSourceStatus = {
  label: "Preparing download" | "Downloading" | "Download complete" | "Download failed" | "Buffering";
  tone: "info" | "success" | "error";
  progress?: number;
};

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
