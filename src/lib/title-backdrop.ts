import { useSyncExternalStore } from "react";

// Per-title backdrop overrides chosen by the user from the Media → Backdrops
// gallery (right-click → "Set as a backdrop"). Persisted to localStorage so a
// pinned backdrop survives navigation and app restarts.

const STORAGE_KEY = "harbor:title-backdrops";

type Store = Record<string, string>;

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

let cache: Store = read();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota / serialization errors
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Non-reactive read, handy inside event handlers. */
export function getTitleBackdrop(metaId: string): string | undefined {
  return cache[metaId];
}

/** Pin a backdrop URL as the hero image for a specific title. */
export function setTitleBackdrop(metaId: string, url: string): void {
  if (cache[metaId] === url) return;
  cache = { ...cache, [metaId]: url };
  persist();
  emit();
}

/** Remove a pinned backdrop, falling back to the default hero image. */
export function clearTitleBackdrop(metaId: string): void {
  if (!(metaId in cache)) return;
  const next = { ...cache };
  delete next[metaId];
  cache = next;
  persist();
  emit();
}

/** Reactive hook: the pinned backdrop URL for a title, or undefined. */
export function useTitleBackdrop(metaId: string | undefined): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (metaId ? cache[metaId] : undefined),
    () => undefined,
  );
}
