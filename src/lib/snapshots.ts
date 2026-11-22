import { useSyncExternalStore } from "react";

let snapVersion = 0;
const snapListeners = new Set<() => void>();

function bumpSnapVersion(): void {
  snapVersion += 1;
  for (const l of snapListeners) l();
}

export function useSnapshotVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      snapListeners.add(cb);
      return () => snapListeners.delete(cb);
    },
    () => snapVersion,
    () => snapVersion,
  );
}

const PREFIX = "harbor.snap.";
const INDEX_KEY = "harbor.snap.index";
const RETENTION_KEY = "harbor.snap.retention";
const MAX_ENTRIES = 80;
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const IDB_NAME = "vayra-snapshots";
const IDB_STORE = "thumbs";

type IndexEntry = { id: string; t: number };

let cachedIndex: IndexEntry[] | null = null;
const memoryCache = new Map<string, string>();
const idbPending = new Set<string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openSnapshotDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function idbPut(id: string, dataUrl: string): void {
  void openSnapshotDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(dataUrl, id);
    } catch {
      /* noop */
    }
  });
}

function idbDelete(id: string): void {
  void openSnapshotDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
    } catch {
      /* noop */
    }
  });
}

function idbClear(): void {
  void openSnapshotDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
    } catch {
      /* noop */
    }
  });
}

function hydrateFromIdb(id: string): void {
  if (!hasIndexedDb() || idbPending.has(id)) return;
  idbPending.add(id);
  void openSnapshotDb().then((db) => {
    if (!db) {
      idbPending.delete(id);
      return;
    }
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => {
        idbPending.delete(id);
        if (typeof req.result === "string" && memoryCache.get(id) !== req.result) {
          memoryCache.set(id, req.result);
          bumpSnapVersion();
        }
      };
      req.onerror = () => {
        idbPending.delete(id);
      };
    } catch {
      idbPending.delete(id);
    }
  });
}

function readIndex(): IndexEntry[] {
  if (cachedIndex) return cachedIndex;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) {
      cachedIndex = [];
      return cachedIndex;
    }
    const parsed = JSON.parse(raw) as IndexEntry[];
    cachedIndex = Array.isArray(parsed) ? parsed : [];
    return cachedIndex;
  } catch {
    cachedIndex = [];
    return cachedIndex;
  }
}

function writeIndex(entries: IndexEntry[]): void {
  cachedIndex = entries;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* noop */
  }
}

function retentionDays(): number {
  try {
    const raw = localStorage.getItem(RETENTION_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
  } catch {
    /* noop */
  }
  return DEFAULT_RETENTION_DAYS;
}

function retentionMs(): number {
  return retentionDays() * DAY_MS;
}

function snapshotsDisabled(): boolean {
  return retentionDays() === 0;
}

function dropEntry(id: string): void {
  memoryCache.delete(id);
  idbDelete(id);
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* noop */
  }
}

function pruneExpired(index: IndexEntry[]): IndexEntry[] {
  const cutoff = Date.now() - retentionMs();
  const kept: IndexEntry[] = [];
  for (const e of index) {
    if (e.t < cutoff) {
      dropEntry(e.id);
    } else {
      kept.push(e);
    }
  }
  return kept;
}

export function readSnapshot(id: string): string | null {
  if (snapshotsDisabled()) return null;
  const index = readIndex();
  const entry = index.find((e) => e.id === id);
  if (!entry) return tryReadOrphan(id);
  if (Date.now() - entry.t > retentionMs()) {
    dropEntry(id);
    writeIndex(index.filter((e) => e.id !== id));
    return null;
  }
  const hit = memoryCache.get(id);
  if (hit !== undefined) return hit;
  try {
    const legacy = localStorage.getItem(PREFIX + id);
    if (legacy) {
      memoryCache.set(id, legacy);
      if (hasIndexedDb()) {
        idbPut(id, legacy);
        try {
          localStorage.removeItem(PREFIX + id);
        } catch {
          /* noop */
        }
      }
      return legacy;
    }
  } catch {
    /* noop */
  }
  hydrateFromIdb(id);
  return null;
}

function tryReadOrphan(id: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    memoryCache.set(id, raw);
    const index = [...readIndex()];
    if (!index.some((e) => e.id === id)) {
      index.push({ id, t: Date.now() });
      writeIndex(index);
    }
    if (hasIndexedDb()) {
      idbPut(id, raw);
      try {
        localStorage.removeItem(PREFIX + id);
      } catch {
        /* noop */
      }
    }
    return raw;
  } catch {
    return null;
  }
}

export function saveSnapshot(id: string, dataUrl: string): void {
  if (snapshotsDisabled()) return;
  let index = readIndex().filter((e) => e.id !== id);
  index = pruneExpired(index);
  index.push({ id, t: Date.now() });
  while (index.length > MAX_ENTRIES) {
    const evicted = index.shift();
    if (evicted) dropEntry(evicted.id);
  }
  if (hasIndexedDb()) {
    memoryCache.set(id, dataUrl);
    idbPut(id, dataUrl);
    try {
      localStorage.removeItem(PREFIX + id);
    } catch {
      /* noop */
    }
    writeIndex(index);
    bumpSnapVersion();
    return;
  }
  let saved = false;
  for (let attempts = 0; attempts < 50; attempts++) {
    try {
      localStorage.setItem(PREFIX + id, dataUrl);
      saved = true;
      break;
    } catch {
      const evicted = index.shift();
      if (!evicted || index.every((e) => e.id === id)) break;
      dropEntry(evicted.id);
    }
  }
  if (!saved) {
    index = index.filter((e) => e.id !== id);
  } else {
    memoryCache.set(id, dataUrl);
  }
  writeIndex(index);
  if (saved) bumpSnapVersion();
}

export function setSnapshotRetentionDays(days: number): void {
  try {
    if (Number.isFinite(days) && days >= 0) {
      localStorage.setItem(RETENTION_KEY, String(Math.round(days)));
    } else {
      localStorage.removeItem(RETENTION_KEY);
    }
  } catch {
    /* noop */
  }
  if (snapshotsDisabled()) {
    clearAllSnapshots();
  } else {
    pruneExpiredSnapshots();
  }
}

export function pruneExpiredSnapshots(): void {
  const pruned = pruneExpired(readIndex());
  writeIndex(pruned);
}

export function clearAllSnapshots(): number {
  const index = readIndex();
  for (const e of index) dropEntry(e.id);
  memoryCache.clear();
  idbClear();
  writeIndex([]);
  bumpSnapVersion();
  try {
    const orphans: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== INDEX_KEY && k !== RETENTION_KEY) orphans.push(k);
    }
    for (const k of orphans) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    }
    return index.length + orphans.length;
  } catch {
    return index.length;
  }
}

export function snapshotCount(): number {
  return readIndex().length;
}

export function getSnapshotRetentionDays(): number {
  try {
    const raw = localStorage.getItem(RETENTION_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  } catch {
    /* noop */
  }
  return DEFAULT_RETENTION_DAYS;
}

const THUMB_WIDTH = 320;
const THUMB_QUALITY = 0.65;
const FULL_WIDTH = 1280;
const FULL_QUALITY = 0.9;

export function captureFrame(video: HTMLVideoElement, fullQuality = false): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  try {
    const canvas = document.createElement("canvas");
    const targetW = fullQuality ? Math.min(FULL_WIDTH, video.videoWidth) : THUMB_WIDTH;
    const scale = targetW / video.videoWidth;
    canvas.width = targetW;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", fullQuality ? FULL_QUALITY : THUMB_QUALITY);
  } catch {
    return null;
  }
}

export async function captureMpvFrame(fullQuality = false): Promise<string | null> {
  const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const fullDataUrl = await invoke<string>("mpv_screenshot_data_url");
    if (!fullDataUrl) return null;
    return await downscaleDataUrl(
      fullDataUrl,
      fullQuality ? FULL_WIDTH : THUMB_WIDTH,
      fullQuality ? FULL_QUALITY : THUMB_QUALITY,
    );
  } catch (e) {
    console.warn("[snapshots] mpv frame capture failed", e);
    return null;
  }
}

async function downscaleDataUrl(dataUrl: string, targetW: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        const w = Math.min(targetW, img.naturalWidth);
        const scale = w / img.naturalWidth;
        canvas.width = w;
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
