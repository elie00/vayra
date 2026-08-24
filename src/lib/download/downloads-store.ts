import { downloadDir as systemDownloadDir } from "@tauri-apps/api/path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import { engineFileFromUrl, torrentEngineRelease } from "@/lib/torrent/local-engine";
import { buildDefaultFilename, sanitizeName } from "./filename";
import { startDownload, type DownloadHandle } from "./video-download";

export type DownloadItem = {
  id: string;
  metaId: string;
  title: string;
  subtitle: string | null;
  poster: string | null;
  season: number | null;
  episode: number | null;
  streamLabel: string | null;
  url: string;
  path: string;
  status: "queued" | "downloading" | "done" | "error" | "canceled" | "interrupted";
  receivedBytes: number;
  totalBytes: number | null;
  ratio: number;
  bytesPerSec: number;
  error: string | null;
  startedAt: number;
};

type EnqueueArgs = {
  meta: Meta;
  episode?: PlayEpisode;
  streamLabel?: string | null;
  url: string;
  headers?: Record<string, string> | null;
};

const items = new Map<string, DownloadItem>();
const handles = new Map<string, DownloadHandle>();
const speed = new Map<string, { bytes: number; at: number }>();
const listeners = new Set<() => void>();

/**
 * How many downloads actually run at once. A season queues every episode at
 * once, and letting all of them pull together helps none of them finish: over
 * the local torrent engine they compete for the same pieces, and each waiting
 * request holds a connection open the whole time.
 */
export const MAX_ACTIVE_DOWNLOADS = 3;

// Downloads accepted but not started yet, oldest first, with the headers their
// request needs once a slot frees up.
const waiting: string[] = [];
const waitingHeaders = new Map<string, Record<string, string> | undefined>();

let snapshot: DownloadItem[] = [];

const PERSIST_KEY = "harbor.downloads.v1";

// A download reports progress about four times a second, so persisting on every
// change would serialize the whole list and block on localStorage that often —
// times the number of active downloads, which a season queue makes large.
const PERSIST_DEBOUNCE_MS = 1000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    const durable = [...items.values()].map((d) => ({ ...d, bytesPerSec: 0 }));
    localStorage.setItem(PERSIST_KEY, JSON.stringify(durable));
  } catch {
    /* ignore */
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(persist, PERSIST_DEBOUNCE_MS);
}

// `durable` writes right away: what the list looks like after a restart hinges on
// it. Byte counts only refine an entry that is already on disk, so they can wait.
function rebuild(durable = true) {
  snapshot = [...items.values()].sort((a, b) => b.startedAt - a.startedAt);
  if (durable) persist();
  else schedulePersist();
  listeners.forEach((l) => l());
}

function hydrate() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as DownloadItem[];
    if (!Array.isArray(arr)) return;
    for (const d of arr) {
      if (!d || typeof d.id !== "string" || typeof d.path !== "string") continue;
      const status = d.status === "downloading" || d.status === "queued" ? "interrupted" : d.status;
      items.set(d.id, { ...d, status, bytesPerSec: 0 });
    }
    snapshot = [...items.values()].sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    /* ignore */
  }
}

hydrate();

// A save pulled from the local engine holds its file selected for as long as it runs.
// Hand it back once it stops, or the torrent stays pinned to the whole pack.
function releaseEngineFile(url: string) {
  const f = engineFileFromUrl(url);
  if (f) void torrentEngineRelease(f.infoHash, [f.fileIdx]);
}

function patch(id: string, next: Partial<DownloadItem>) {
  const cur = items.get(id);
  if (!cur) return;
  items.set(id, { ...cur, ...next });
  rebuild(next.status !== undefined && next.status !== cur.status);
}

function sep(): string {
  return navigator.platform.toLowerCase().includes("win") ? "\\" : "/";
}

async function resolveDir(): Promise<string> {
  try {
    const raw = localStorage.getItem("harbor.settings");
    const fromSettings = raw ? (JSON.parse(raw) as { downloadDir?: string }).downloadDir?.trim() : "";
    if (fromSettings) return fromSettings;
  } catch {
    /* fall through to system default */
  }
  return (await systemDownloadDir().catch(() => "")) || "";
}

async function pathTaken(path: string): Promise<boolean> {
  for (const d of items.values()) if (d.path === path) return true;
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

async function uniquePath(path: string): Promise<string> {
  if (!(await pathTaken(path))) return path;
  const s = sep();
  const slash = path.lastIndexOf(s);
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${dir}${stem} (${i})${ext}`;
    if (!(await pathTaken(candidate))) return candidate;
  }
  return path;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}`;
}

export function activeDownloadFor(
  metaId: string,
  season?: number | null,
  episode?: number | null,
): DownloadItem | null {
  for (const d of items.values()) {
    if (d.metaId !== metaId) continue;
    if (season != null && episode != null) {
      if (d.season !== season || d.episode !== episode) continue;
    } else if (d.season != null || d.episode != null) {
      continue;
    }
    return d;
  }
  return null;
}

export async function enqueueDownload(args: EnqueueArgs): Promise<string> {
  const { meta, episode, streamLabel, url, headers } = args;
  let dir = await resolveDir();
  try {
    const raw = localStorage.getItem("harbor.settings");
    const settings = raw ? (JSON.parse(raw) as { downloadCreateFolders?: boolean }) : null;
    if (settings?.downloadCreateFolders && dir) {
      const folderName = sanitizeName(meta.name || "download");
      dir = `${dir}${dir.endsWith(sep()) ? "" : sep()}${folderName}`;
      await mkdir(dir, { recursive: true }).catch(() => {});
    }
  } catch {}
  const filename = buildDefaultFilename(meta, episode, url, streamLabel);
  const path = await uniquePath(
    dir ? `${dir}${dir.endsWith(sep()) ? "" : sep()}${filename}` : filename,
  );
  const id = randomId();
  const item: DownloadItem = {
    id,
    metaId: meta.id,
    title: meta.name ?? "Download",
    subtitle: episode
      ? `S${episode.imdbSeason ?? episode.season} · E${String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}${episode.name ? ` · ${episode.name}` : ""}`
      : (meta.releaseInfo ?? null),
    poster: meta.poster ?? null,
    season: episode?.season ?? null,
    episode: episode?.episode ?? null,
    streamLabel: streamLabel ?? null,
    url,
    path,
    status: "downloading",
    receivedBytes: 0,
    totalBytes: null,
    ratio: 0,
    bytesPerSec: 0,
    error: null,
    startedAt: Date.now(),
  };
  const free = handles.size < MAX_ACTIVE_DOWNLOADS;
  items.set(id, { ...item, status: free ? "downloading" : "queued" });
  speed.set(id, { bytes: 0, at: Date.now() });
  if (free) {
    beginDownload(id, headers ?? undefined);
  } else {
    waiting.push(id);
    waitingHeaders.set(id, headers ?? undefined);
  }
  rebuild();
  return id;
}

function beginDownload(id: string, headers: Record<string, string> | undefined): void {
  const item = items.get(id);
  if (!item) return;
  const { url, path } = item;
  const handle = startDownload(id, url, path, (p) => {
    const now = Date.now();
    const s = speed.get(id);
    let bps = 0;
    if (s && now - s.at >= 500) {
      bps = ((p.receivedBytes - s.bytes) / (now - s.at)) * 1000;
      speed.set(id, { bytes: p.receivedBytes, at: now });
    }
    patch(id, {
      receivedBytes: p.receivedBytes,
      totalBytes: p.totalBytes,
      ratio: p.ratio,
      ...(bps > 0 ? { bytesPerSec: bps } : {}),
    });
  }, headers);
  handles.set(id, handle);
  handle.promise
    .then(() => patch(id, { status: "done", ratio: 1, bytesPerSec: 0 }))
    .catch((e: unknown) => {
      if (e instanceof Error && e.name === "AbortError") {
        patch(id, { status: "canceled", bytesPerSec: 0 });
        return;
      }
      patch(id, { status: "error", error: e instanceof Error ? e.message : "Download failed", bytesPerSec: 0 });
    })
    .finally(() => {
      handles.delete(id);
      speed.delete(id);
      releaseEngineFile(url);
      pump();
    });
}

// Hand the freed slot to the entry that has waited longest and is still wanted.
function pump(): void {
  while (handles.size < MAX_ACTIVE_DOWNLOADS) {
    const id = waiting.shift();
    if (id === undefined) return;
    const headers = waitingHeaders.get(id);
    waitingHeaders.delete(id);
    if (items.get(id)?.status !== "queued") continue;
    patch(id, { status: "downloading" });
    beginDownload(id, headers);
    return;
  }
}

function dropFromQueue(id: string): void {
  const at = waiting.indexOf(id);
  if (at >= 0) waiting.splice(at, 1);
  waitingHeaders.delete(id);
}

export function cancelDownload(id: string): void {
  const handle = handles.get(id);
  if (handle) {
    handle.abort();
    return;
  }
  // Nothing to abort: it never got a slot.
  if (items.get(id)?.status !== "queued") return;
  dropFromQueue(id);
  patch(id, { status: "canceled", bytesPerSec: 0 });
}

export function removeDownload(id: string): void {
  const item = items.get(id);
  handles.get(id)?.abort();
  handles.delete(id);
  speed.delete(id);
  dropFromQueue(id);
  if (item) releaseEngineFile(item.url);
  if (items.delete(id)) rebuild();
  if (item) {
    void remove(item.path).catch(() => {});
    void remove(`${item.path}.part`).catch(() => {});
  }
}

export async function revealDownload(id: string): Promise<void> {
  const d = items.get(id);
  if (!d) return;
  try {
    await revealItemInDir(d.path);
  } catch {
    /* opener unavailable */
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDownloads(): DownloadItem[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function useActiveDownloadCount(): number {
  const all = useDownloads();
  return all.filter((d) => d.status === "downloading" || d.status === "queued").length;
}
