import { safeFetch as fetch } from "@/lib/safe-fetch";

const API = "https://api.strem.io/api";

export type User = {
  _id: string;
  email: string;
  fullname?: string;
  avatar?: string;
};

export type LibraryItem = {
  _id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  background?: string;
  state?: {
    timeOffset: number;
    duration: number;
    season?: number;
    episode?: number;
    timeWatched?: number;
    flaggedWatched?: number;
    watched?: string;
    video_id?: string;
  };
  removed: boolean;
  temp: boolean;
  _ctime: string;
  _mtime: string;
};

export function episodeFromVideoId(
  videoId: string | undefined | null,
): { season: number; episode: number } | null {
  if (!videoId) return null;
  const parts = videoId.split(":");
  if (parts.length < 3) return null;
  const season = Number(parts[parts.length - 2]);
  const episode = Number(parts[parts.length - 1]);
  if (!Number.isInteger(season) || !Number.isInteger(episode) || season < 0 || episode < 0) {
    return null;
  }
  return { season, episode };
}

async function call<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "Request failed");
  return json.result as T;
}

export function login(email: string, password: string) {
  return call<{ authKey: string; user: User }>("login", {
    email,
    password,
    facebook: false,
  });
}

export function logout(authKey: string) {
  return call<unknown>("logout", { authKey });
}

export async function library(authKey: string): Promise<LibraryItem[]> {
  const ids = await call<Array<[string, string]>>("datastoreMeta", {
    authKey,
    collection: "libraryItem",
  });
  if (!ids?.length) return [];
  return call<LibraryItem[]>("datastoreGet", {
    authKey,
    collection: "libraryItem",
    ids: ids.map(([id]) => id),
    all: true,
  });
}

export async function libraryGetOne(authKey: string, id: string): Promise<LibraryItem | null> {
  const items = await call<LibraryItem[]>("datastoreGet", {
    authKey,
    collection: "libraryItem",
    ids: [id],
    all: true,
  }).catch(() => [] as LibraryItem[]);
  return items?.[0] ?? null;
}

export async function libraryPut(authKey: string, item: LibraryItem): Promise<void> {
  await call<unknown>("datastorePut", {
    authKey,
    collection: "libraryItem",
    changes: [item],
  });
}

export async function removeStremioLibraryItem(authKey: string, id: string): Promise<void> {
  const items = await call<LibraryItem[]>("datastoreGet", {
    authKey,
    collection: "libraryItem",
    ids: [id],
    all: true,
  });
  const item = items?.[0];
  if (!item) return;
  await libraryPut(authKey, {
    ...item,
    removed: true,
    temp: false,
    _mtime: new Date().toISOString(),
  });
}
