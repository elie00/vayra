import type { MalSession } from "./types";

const STORAGE_KEY = "harbor.mal.session.v1";

const subscribers = new Set<() => void>();
let cached: MalSession | null = null;
let loaded = false;

function read(): MalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MalSession;
    if (
      typeof parsed?.accessToken !== "string" ||
      typeof parsed?.refreshToken !== "string" ||
      typeof parsed?.createdAt !== "number" ||
      typeof parsed?.expiresAt !== "number" ||
      typeof parsed?.userName !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(session: MalSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  cached = read();
}

export function getSession(): MalSession | null {
  ensureLoaded();
  return cached;
}

export function setSession(session: MalSession | null): void {
  ensureLoaded();
  cached = session;
  write(session);
  for (const fn of subscribers) fn();
}

export function subscribeSession(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function isAuthenticated(): boolean {
  const s = getSession();
  if (!s) return false;
  return Date.now() < s.expiresAt;
}
