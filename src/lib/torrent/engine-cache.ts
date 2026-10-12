import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Meta } from "@/lib/cinemeta";
import { enqueueDownload } from "@/lib/download/downloads-store";
import type { PlaybackEntry } from "@/lib/playback-history";
import type { PlayEpisode } from "@/lib/view";
import { torrentEngineStatus } from "./local-engine";

/** A file the torrent engine finished and still keeps in its cache. */
export type CachedEngineFile = {
  info_hash: string;
  file_idx: number;
  name: string;
  size: number;
  /** When the cache sweep removes it, in Unix milliseconds. */
  expires_at_ms: number | null;
};

const POLL_MS = 60_000;
/** How long before the sweep a file still worth keeping is announced. */
export const WARN_BEFORE_MS = 2 * 60 * 60 * 1000;
const WATCHED_KEY = "vayra.engine-cache.watched.v1";
const WARNED_KEY = "vayra.engine-cache.warned.v1";
const MAX_MARKS = 200;

let files: readonly CachedEngineFile[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshCachedEngineFiles(): Promise<void> {
  try {
    files = await invoke<CachedEngineFile[]>("torrent_engine_cached_files");
  } catch {
    return; // No engine here (browser, mobile without it): nothing is cached.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) {
    void refreshCachedEngineFiles();
    timer = setInterval(() => void refreshCachedEngineFiles(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useCachedEngineFiles(): readonly CachedEngineFile[] {
  return useSyncExternalStore(subscribe, () => files, () => files);
}

/** The complete cached file that an earlier playback of this title or episode used. */
export function cachedFileForPlayback(
  cached: readonly CachedEngineFile[],
  entry: Pick<PlaybackEntry, "infoHash" | "fileIdx"> | null,
): CachedEngineFile | null {
  if (!entry?.infoHash) return null;
  const hash = entry.infoHash.toLowerCase();
  const same = cached.filter((f) => f.info_hash === hash);
  if (entry.fileIdx != null) return same.find((f) => f.file_idx === entry.fileIdx) ?? null;
  return same.length === 1 ? same[0] : null;
}

/** The stream label a save from the picker would carry, from what the playback kept. */
export function playbackStreamLabel(entry: PlaybackEntry | null): string | null {
  if (!entry) return null;
  return [entry.resolution, entry.source].filter(Boolean).join(" ") || entry.parsedTitle || entry.title || null;
}

/**
 * Save a cached file through the downloads queue. The backend sees that the file is
 * already complete in the cache and copies it instead of downloading it again.
 */
export async function keepCachedFile(
  file: CachedEngineFile,
  meta: Meta,
  episode: PlayEpisode | undefined,
  streamLabel: string | null,
): Promise<boolean> {
  const status = await torrentEngineStatus();
  if (!status?.port) return false;
  await enqueueDownload({
    meta,
    episode,
    streamLabel,
    url: `http://127.0.0.1:${status.port}/stream/${file.info_hash}/${file.file_idx}`,
  });
  return true;
}

function fileKey(infoHash: string, fileIdx: number): string {
  return `${infoHash.toLowerCase()}:${fileIdx}`;
}

function readMarks(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function addMark(key: string, mark: string): void {
  const marks = readMarks(key).filter((m) => m !== mark);
  marks.push(mark);
  try {
    localStorage.setItem(key, JSON.stringify(marks.slice(-MAX_MARKS)));
  } catch {
    /* quota: the mark is only a convenience */
  }
}

/** A file played to its end needs no warning before the cache lets it go. */
export function markCachedFileWatched(infoHash: string, fileIdx: number): void {
  addMark(WATCHED_KEY, fileKey(infoHash, fileIdx));
}

export function isCachedFileWatched(file: CachedEngineFile): boolean {
  return readMarks(WATCHED_KEY).includes(fileKey(file.info_hash, file.file_idx));
}

export function markCachedFileWarned(file: CachedEngineFile): void {
  addMark(WARNED_KEY, fileKey(file.info_hash, file.file_idx));
}

export function wasCachedFileWarned(file: CachedEngineFile): boolean {
  return readMarks(WARNED_KEY).includes(fileKey(file.info_hash, file.file_idx));
}

/** Files the sweep removes soon that were neither played to the end nor announced yet. */
export function expiringSoon(cached: readonly CachedEngineFile[], now: number): CachedEngineFile[] {
  return cached.filter(
    (f) =>
      f.expires_at_ms != null &&
      f.expires_at_ms > now &&
      f.expires_at_ms - now <= WARN_BEFORE_MS &&
      !isCachedFileWatched(f) &&
      !wasCachedFileWarned(f),
  );
}
