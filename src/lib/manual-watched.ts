const KEY = "harbor.manualwatched.v1";
const UNKEY = "harbor.manualunwatched.v1";

const subs = new Set<() => void>();
let version = 0;
let watchedCache: Set<string> | null = null;
let unwatchedCache: Set<string> | null = null;

function loadSet(storageKey: string): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function watchedSet(): Set<string> {
  if (!watchedCache) watchedCache = loadSet(KEY);
  return watchedCache;
}

function unwatchedSet(): Set<string> {
  if (!unwatchedCache) unwatchedCache = loadSet(UNKEY);
  return unwatchedCache;
}

function persist(on: Set<string>, off: Set<string>): void {
  watchedCache = on;
  unwatchedCache = off;
  try {
    localStorage.setItem(KEY, JSON.stringify([...on]));
    localStorage.setItem(UNKEY, JSON.stringify([...off]));
  } catch {
    return;
  }
  version += 1;
  for (const fn of subs) fn();
}

function key(metaId: string, season: number, episode: number): string {
  return `${metaId}|${season}|${episode}`;
}

export function isManuallyWatched(metaId: string, season: number, episode: number): boolean {
  return watchedSet().has(key(metaId, season, episode));
}

export function manualWatchedState(
  metaId: string,
  season: number,
  episode: number,
): boolean | undefined {
  const k = key(metaId, season, episode);
  if (watchedSet().has(k)) return true;
  if (unwatchedSet().has(k)) return false;
  return undefined;
}

export function setManualWatched(
  metaId: string,
  season: number,
  episode: number,
  watched: boolean,
): void {
  const on = new Set(watchedSet());
  const off = new Set(unwatchedSet());
  const k = key(metaId, season, episode);
  if (watched) {
    on.add(k);
    off.delete(k);
  } else {
    on.delete(k);
    off.add(k);
  }
  persist(on, off);
}

export function setManualWatchedUpTo(
  metaId: string,
  season: number,
  episode: number,
  watched: boolean,
): void {
  const on = new Set(watchedSet());
  const off = new Set(unwatchedSet());
  for (let e = 1; e <= episode; e++) {
    const k = key(metaId, season, e);
    if (watched) {
      on.add(k);
      off.delete(k);
    } else {
      on.delete(k);
      off.add(k);
    }
  }
  persist(on, off);
}

export function setManualWatchedMany(
  metaId: string,
  episodes: Array<{ season: number; episode: number }>,
  watched: boolean,
): void {
  const on = new Set(watchedSet());
  const off = new Set(unwatchedSet());
  for (const { season, episode } of episodes) {
    const k = key(metaId, season, episode);
    if (watched) {
      on.add(k);
      off.delete(k);
    } else {
      on.delete(k);
      off.add(k);
    }
  }
  persist(on, off);
}

export function subscribeManualWatched(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function manualWatchedVersion(): number {
  return version;
}
