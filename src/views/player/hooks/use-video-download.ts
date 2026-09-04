import { downloadDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { randomUuid } from "@/lib/uuid";
import {
  buildDefaultFilename,
  extensionFromUrl,
} from "@/lib/download/filename";
import {
  startDownload,
  type DownloadHandle,
  type DownloadProgress,
} from "@/lib/download/video-download";
import { nextDownloadTelemetry, type DownloadTelemetry } from "@/lib/download/telemetry";
import { useSettings } from "@/lib/settings";
import type { PlayEpisode } from "@/lib/view";
import { pathSeparator } from "@/lib/platform";

export type DownloadStatus =
  | { kind: "idle" }
  | { kind: "preparing" }
  | {
      kind: "downloading";
      ratio: number;
      receivedBytes: number;
      totalBytes: number | null;
      bytesPerSecond?: number | null;
      etaSeconds?: number | null;
    }
  | {
      kind: "paused";
      ratio: number;
      receivedBytes: number;
      totalBytes: number | null;
    }
  | { kind: "done"; path: string }
  | { kind: "error"; message: string };

type Args = {
  url: string;
  meta: Meta;
  episode?: PlayEpisode;
};

export function useVideoDownload({ url, meta, episode }: Args) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<DownloadStatus>({ kind: "idle" });
  const handleRef = useRef<DownloadHandle | null>(null);
  const telemetryRef = useRef<DownloadTelemetry | null>(null);
  const targetRef = useRef<{ id: string; path: string } | null>(null);
  const progressRef = useRef<DownloadProgress>({
    ratio: 0,
    receivedBytes: 0,
    totalBytes: null,
  });
  const pauseRequestedRef = useRef(false);

  useEffect(
    () => () => {
      handleRef.current?.abort();
    },
    [],
  );

  const begin = useCallback((target: { id: string; path: string }) => {
    telemetryRef.current = null;
    pauseRequestedRef.current = false;
    const current = progressRef.current;
    setStatus({ kind: "downloading", ...current });
    const handle = startDownload(target.id, url, target.path, (p: DownloadProgress) => {
      progressRef.current = p;
      const telemetry = nextDownloadTelemetry(telemetryRef.current, p, performance.now());
      telemetryRef.current = telemetry;
      setStatus({
        kind: "downloading",
        ratio: p.ratio,
        receivedBytes: p.receivedBytes,
        totalBytes: p.totalBytes,
        bytesPerSecond: telemetry.bytesPerSecond,
        etaSeconds: telemetry.etaSeconds,
      });
    });
    handleRef.current = handle;
    handle.promise
      .then(() => {
        setStatus({ kind: "done", path: target.path });
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") {
          setStatus(
            pauseRequestedRef.current
              ? { kind: "paused", ...progressRef.current }
              : { kind: "idle" },
          );
          return;
        }
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "Download failed",
        });
      })
      .finally(() => {
        if (handleRef.current === handle) handleRef.current = null;
        telemetryRef.current = null;
      });
  }, [url]);

  const start = useCallback(async () => {
    if (handleRef.current) return;
    setStatus({ kind: "preparing" });
    const defaultFilename = buildDefaultFilename(meta, episode, url);
    const ext = extensionFromUrl(url);
    const sep = pathSeparator();
    const settingsDir = settings.downloadDir.trim();
    const dir = settingsDir || (await downloadDir().catch(() => "")) || "";
    const defaultPath = dir ? `${dir}${dir.endsWith(sep) ? "" : sep}${defaultFilename}` : defaultFilename;
    let path: string | null = null;
    try {
      path = await save({
        defaultPath,
        filters: [{ name: "Video", extensions: [ext, "mkv", "mp4", "webm"] }],
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Save dialog failed",
      });
      return;
    }
    if (!path) {
      setStatus({ kind: "idle" });
      return;
    }

    progressRef.current = { ratio: 0, receivedBytes: 0, totalBytes: null };
    const target = { id: randomUuid(), path };
    targetRef.current = target;
    begin(target);
  }, [url, meta, episode, settings.downloadDir, begin]);

  const pause = useCallback(() => {
    if (!handleRef.current) return;
    pauseRequestedRef.current = true;
    handleRef.current.abort();
  }, []);

  const resume = useCallback(() => {
    if (handleRef.current || !targetRef.current) return;
    begin(targetRef.current);
  }, [begin]);

  const cancel = useCallback(() => {
    pauseRequestedRef.current = false;
    handleRef.current?.abort();
  }, []);

  const reveal = useCallback(async () => {
    if (status.kind !== "done") return;
    try {
      await revealItemInDir(status.path);
    } catch {
      return;
    }
  }, [status]);

  const reset = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  return { status, start, pause, resume, cancel, reveal, reset };
}
