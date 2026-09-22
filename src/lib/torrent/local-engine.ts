import { invoke } from "@tauri-apps/api/core";
import { isLocalEngineUrl } from "@/lib/stremio-server";
import type { EngineCacheConfig } from "./engine-config-sync";
import { stopFullDownload } from "./full-download";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type EngineStatus = {
  ready: boolean;
  port: number | null;
  active_torrents: number;
  last_error: string | null;
  dht_tier?: number;
  dht_nodes?: number;
};

export type EngineFile = {
  idx: number;
  name: string;
  length: number;
};

export type AddResult = {
  info_hash: string;
  files: EngineFile[];
  stream_base: string;
};

export type TorrentEngineStats = {
  peers: number;
  unchoked: number;
  downloaded: number;
  downloadSpeed: number;
  streamProgress: number;
  streamLen: number;
  peerSearchRunning: boolean;
  finished: boolean;
  state: string;
};

export type SelfTestStep = {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
};

export type SelfTestResult = {
  pass: boolean;
  steps: SelfTestStep[];
};

export async function torrentEngineStatus(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_status");
  } catch {
    return null;
  }
}

let lastAddError: string | null = null;

export function lastEngineAddError(): string | null {
  return lastAddError;
}

export async function torrentEngineAdd(
  magnet: string,
  trackers: string[],
  fileIdx?: number,
): Promise<AddResult | null> {
  if (!isTauri) return null;
  try {
    lastAddError = null;
    return await invoke<AddResult>("torrent_engine_add", {
      magnet,
      trackers,
      fileIdx: typeof fileIdx === "number" && fileIdx >= 0 ? fileIdx : null,
    });
  } catch (e) {
    lastAddError = String(e);
    console.warn("[engine] add failed", e);
    return null;
  }
}

export async function torrentEngineSelect(infoHash: string, fileIdx: number): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_select", { infoHash, fileIdx }).catch((e) =>
    console.warn("[engine] select failed", e),
  );
}

export async function torrentEngineSelectMany(infoHash: string, fileIdxs: number[]): Promise<boolean> {
  if (!isTauri || fileIdxs.length === 0) return false;
  try {
    await invoke("torrent_engine_select_many", { infoHash, fileIdxs });
    return true;
  } catch (e) {
    console.warn("[engine] select_many failed", e);
    return false;
  }
}

/**
 * Hand back the files a finished save was holding, so a later stream can narrow the
 * torrent down again instead of keeping a whole pack selected.
 */
export async function torrentEngineRelease(infoHash: string, fileIdxs: number[]): Promise<void> {
  if (!isTauri || fileIdxs.length === 0) return;
  await invoke("torrent_engine_release", { infoHash, fileIdxs }).catch((e) =>
    console.warn("[engine] release failed", e),
  );
}

/** Read back the torrent file an engine (or Stremio server) stream URL points at. */
export function engineFileFromUrl(url: string): { infoHash: string; fileIdx: number } | null {
  const m = /\/([0-9a-f]{40})\/(\d+)(?:[?#]|$)/i.exec(url);
  if (!m) return null;
  return { infoHash: m[1].toLowerCase(), fileIdx: Number(m[2]) };
}

type DownloadTorrent = { infoHash: string; fileIdx: number };
const downloadTorrents = new Map<string, DownloadTorrent>();
const downloadSelections = new Map<string, Promise<void>>();
const deferredRemovals = new Map<string, boolean>();
const removalVersions = new Map<string, number>();

function hasDownloadTorrent(infoHash: string): boolean {
  return [...downloadTorrents.values()].some((file) => file.infoHash === infoHash);
}

function updateDownloadSelection(infoHash: string, update: () => Promise<void>): Promise<void> {
  // A release finishing after a new selection must not unpin the new owner's file.
  const pending = downloadSelections.get(infoHash) ?? Promise.resolve();
  const next = pending.catch(() => { /* Original owner receives the error; unblock later selection/release. */ }).then(update);
  downloadSelections.set(infoHash, next);
  const clear = () => {
    if (downloadSelections.get(infoHash) === next) downloadSelections.delete(infoHash);
  };
  void next.then(clear, clear);
  return next;
}

/**
 * A queued, paused or running save owns its local torrent independently of the
 * player. Register the hold before awaiting selection, then await this promise
 * before starting the HTTP copy. Calling it again safely reselects on resume.
 */
export async function retainTorrentForDownload(downloadId: string, url: string): Promise<void> {
  if (!isTauri || !isLocalEngineUrl(url)) return;
  const file = engineFileFromUrl(url);
  if (!file) return;
  const previous = downloadTorrents.get(downloadId);
  if (previous && (previous.infoHash !== file.infoHash || previous.fileIdx !== file.fileIdx)) {
    throw new Error("A partial download cannot change its torrent source");
  }
  const held = previous ?? file;
  downloadTorrents.set(downloadId, held);
  await updateDownloadSelection(file.infoHash, async () => {
    if (downloadTorrents.get(downloadId) !== held) return;
    const fileIdxs = [...new Set([...downloadTorrents.values()]
      .filter((owner) => owner.infoHash === file.infoHash)
      .map((owner) => owner.fileIdx))];
    await invoke("torrent_engine_select_many", { infoHash: file.infoHash, fileIdxs });
  });
}

/** Release only on completion, cancellation or removal, not on player exit/pause. */
export async function releaseTorrentForDownload(downloadId: string): Promise<void> {
  const file = downloadTorrents.get(downloadId);
  if (!file) return;
  downloadTorrents.delete(downloadId);
  await updateDownloadSelection(file.infoHash, async () => {
    const sameFileHeld = [...downloadTorrents.values()].some((owner) =>
      owner.infoHash === file.infoHash && owner.fileIdx === file.fileIdx);
    if (!sameFileHeld) await torrentEngineRelease(file.infoHash, [file.fileIdx]);
  });
  const deleteFiles = deferredRemovals.get(file.infoHash);
  if (deleteFiles !== undefined && !hasDownloadTorrent(file.infoHash)) {
    deferredRemovals.delete(file.infoHash);
    await torrentEngineRemove(file.infoHash, deleteFiles);
  }
}

export async function torrentEngineStats(
  infoHash: string,
  fileIdx: number | null,
): Promise<TorrentEngineStats | null> {
  if (!isTauri) return null;
  try {
    return await invoke<TorrentEngineStats>("torrent_engine_stats", { infoHash, fileIdx });
  } catch {
    return null;
  }
}

export async function torrentEngineRemove(infoHash: string, deleteFiles: boolean): Promise<void> {
  if (!isTauri) return;
  infoHash = infoHash.trim().toLowerCase();
  const removalVersion = removalVersions.get(infoHash) ?? 0;
  if (hasDownloadTorrent(infoHash)) {
    deferredRemovals.set(infoHash, deleteFiles);
    return;
  }
  const selecting = downloadSelections.get(infoHash);
  if (selecting) {
    await selecting.catch(() => { /* Selection failure is reported to its download; removal still needs to settle. */ });
    if ((removalVersions.get(infoHash) ?? 0) !== removalVersion) return;
    // A save may have acquired the torrent while its old selection was released.
    if (hasDownloadTorrent(infoHash)) {
      deferredRemovals.set(infoHash, deleteFiles);
      return;
    }
  }
  stopFullDownload(infoHash);
  await invoke("torrent_engine_remove", { infoHash, deleteFiles }).catch((e) =>
    console.warn("[engine] remove failed", e),
  );
}

const pendingRemovals = new Map<string, number>();

export function scheduleTorrentRemoval(infoHash: string, deleteFiles = false, delayMs = 1200): void {
  if (!isTauri) return;
  infoHash = infoHash.trim().toLowerCase();
  cancelTorrentRemoval(infoHash);
  const id = window.setTimeout(() => {
    pendingRemovals.delete(infoHash);
    void torrentEngineRemove(infoHash, deleteFiles);
  }, delayMs);
  pendingRemovals.set(infoHash, id);
}

export function cancelTorrentRemoval(infoHash: string): void {
  infoHash = infoHash.trim().toLowerCase();
  removalVersions.set(infoHash, (removalVersions.get(infoHash) ?? 0) + 1);
  // Returning to playback withdraws both the timer and any removal that a save
  // deferred. Completing that save must not then tear down the active player.
  deferredRemovals.delete(infoHash);
  const id = pendingRemovals.get(infoHash);
  if (id != null) {
    window.clearTimeout(id);
    pendingRemovals.delete(infoHash);
  }
}

export async function torrentEngineSelfTest(): Promise<SelfTestResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SelfTestResult>("torrent_engine_selftest");
  } catch (e) {
    console.warn("[engine] selftest failed", e);
    return null;
  }
}

export async function torrentEngineRestart(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_restart");
  } catch (e) {
    console.warn("[engine] restart failed", e);
    return null;
  }
}

export async function torrentEngineHardReset(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_hard_reset");
  } catch (e) {
    console.warn("[engine] hard reset failed", e);
    return null;
  }
}

/** The cache settings the engine is actually running on, from its own config. */
export async function readEngineOptions(): Promise<EngineCacheConfig | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineCacheConfig>("torrent_engine_get_options");
  } catch {
    return null;
  }
}

export async function torrentEngineSetOptions(
  dir: string | null,
  retentionHours: number,
  maxGb: number,
  restart: boolean,
): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_set_options", { dir, retentionHours, maxGb, restart }).catch((e) =>
    console.warn("[engine] set options failed", e),
  );
}
