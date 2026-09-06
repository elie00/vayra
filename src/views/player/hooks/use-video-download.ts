import { downloadDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { buildDefaultFilename, extensionFromUrl } from "@/lib/download/filename";
import {
  cancelDownload, downloadSnapshot, enqueueDownload, pauseDownload,
  resumeDownload, revealDownload, useDownloads, type DownloadItem,
} from "@/lib/download/downloads-store";
import { useSettings } from "@/lib/settings";
import type { PlayEpisode } from "@/lib/view";
import { pathSeparator } from "@/lib/platform";

type Progress = { ratio: number; receivedBytes: number; totalBytes: number | null };
export type DownloadStatus =
  | { kind: "idle" }
  | { kind: "preparing" }
  | ({ kind: "queued" | "paused" } & Progress)
  | ({ kind: "downloading"; bytesPerSecond?: number | null; etaSeconds?: number | null } & Progress)
  | { kind: "done"; path: string }
  | { kind: "error"; message: string };

type Args = { url: string; headers?: Record<string, string> | null; meta: Meta; episode?: PlayEpisode };

function matchesMedia(item: DownloadItem, metaId: string, episode?: PlayEpisode): boolean {
  return item.metaId === metaId && item.season === (episode?.season ?? null) && item.episode === (episode?.episode ?? null);
}

/** Reattach to this movie/episode, preferring the playing source. Never let a
 * canceled transfer hide a live one, or attach to another episode of a pack. */
function findDownload(items: readonly DownloadItem[], args: Args): DownloadItem | undefined {
  const candidates = items.filter((item) => item.status !== "canceled" && matchesMedia(item, args.meta.id, args.episode));
  return candidates.find((item) => item.url === args.url) ?? candidates[0];
}

function statusFor(item: DownloadItem): DownloadStatus {
  const progress = { ratio: item.ratio, receivedBytes: item.receivedBytes, totalBytes: item.totalBytes };
  switch (item.status) {
    case "queued": return { kind: "queued", ...progress };
    case "paused":
    case "interrupted": return { kind: "paused", ...progress };
    case "downloading": return { kind: "downloading", ...progress, bytesPerSecond: item.bytesPerSec,
      etaSeconds: item.bytesPerSec > 0 && item.totalBytes != null ? Math.max(0, (item.totalBytes - item.receivedBytes) / item.bytesPerSec) : null };
    case "done": return { kind: "done", path: item.path };
    case "error": return { kind: "error", message: item.error ?? "Download failed" };
    case "canceled": return { kind: "idle" };
  }
}

/** The player is only a controller. Transfers belong to the central store and
 * intentionally outlive this hook, the player, and source/episode changes. */
export function useVideoDownload({ url, headers, meta, episode }: Args) {
  const { settings } = useSettings();
  const all = useDownloads();
  const mediaKey = JSON.stringify([meta.id, episode?.season ?? null, episode?.episode ?? null]);
  const [selected, setSelected] = useState<{ key: string; id: string } | null>(null);
  const [local, setLocal] = useState<{ key: string; status: DownloadStatus } | null>(null);
  const preparingRef = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const item = (selected?.key === mediaKey ? all.find((d) => d.id === selected.id && d.status !== "canceled") : undefined)
    ?? findDownload(all, { url, headers, meta, episode });
  // A stable status also avoids rerunning the transport's speed effect on its
  // own renders when another download reports progress.
  const status = useMemo<DownloadStatus>(() => item ? statusFor(item)
    : local?.key === mediaKey ? local.status : { kind: "idle" }, [item, local, mediaKey]);

  const start = useCallback(async () => {
    if (preparingRef.current) return;
    const existing = findDownload(downloadSnapshot(), { url, meta, episode });
    if (existing) {
      setSelected({ key: mediaKey, id: existing.id });
      if (["paused", "interrupted", "error"].includes(existing.status)) resumeDownload(existing.id);
      return;
    }
    preparingRef.current = true;
    const source = { url, headers: headers ? { ...headers } : undefined, meta: { ...meta }, episode: episode ? { ...episode } : undefined };
    setLocal({ key: mediaKey, status: { kind: "preparing" } });
    try {
      const defaultFilename = buildDefaultFilename(meta, episode, url);
      const ext = extensionFromUrl(url);
      const sep = pathSeparator();
      const dir = settings.downloadDir.trim() || (await downloadDir().catch(() => "")) || "";
      if (!mountedRef.current) return;
      const path = await save({
        defaultPath: dir ? `${dir}${dir.endsWith(sep) ? "" : sep}${defaultFilename}` : defaultFilename,
        filters: [{ name: "Video", extensions: [ext, "mkv", "mp4", "webm"] }],
      });
      if (!path || !mountedRef.current) return;
      // Another controller may have queued this episode while Save was open.
      const concurrent = findDownload(downloadSnapshot(), source);
      const id = concurrent?.id ?? await enqueueDownload({ ...source, destinationPath: path });
      if (mountedRef.current) setSelected({ key: mediaKey, id });
    } catch (error) {
      if (mountedRef.current) setLocal({ key: mediaKey, status: { kind: "error", message: error instanceof Error ? error.message : "Download failed" } });
    } finally {
      preparingRef.current = false;
      if (mountedRef.current) setLocal((current) => current?.status.kind === "preparing" ? null : current);
    }
  }, [url, headers, meta, episode, mediaKey, settings.downloadDir]);

  const id = item?.id;
  const pause = useCallback(() => { if (id) pauseDownload(id); }, [id]);
  const resume = useCallback(() => { if (id) resumeDownload(id); }, [id]);
  const cancel = useCallback(() => { if (id) cancelDownload(id); }, [id]);
  const reveal = useCallback(async () => { if (id) await revealDownload(id); }, [id]);
  // Kept for existing transport API: retry a failed transfer in place, without
  // deleting its partial file or silently creating a second copy.
  const reset = useCallback(() => {
    if (id && item?.status === "error") resumeDownload(id);
    setLocal(null);
  }, [id, item?.status]);
  return { status, start, pause, resume, cancel, reveal, reset };
}
