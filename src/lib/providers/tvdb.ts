import { lruSet } from "@/lib/cache";
import { registerCache } from "@/lib/memory-profiler";
import { safeFetch as tauriFetch } from "@/lib/safe-fetch";

const BASE = "https://api4.thetvdb.com/v4";
const TOKEN_KEY = "harbor.tvdb.token.v1";
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

type TokenCache = { token: string; t: number; key: string };

type SearchHit = {
  tvdb_id: string;
  name?: string;
  type?: string;
  year?: string;
  remote_ids?: { id: string; type: number; sourceName: string }[];
};

export type TvdbEpisode = {
  id: number;
  number: number;
  seasonNumber: number;
  absoluteNumber?: number;
  name?: string;
  overview?: string;
  aired?: string;
  runtime?: number;
  image?: string;
  imdbId?: string;
};

export type TvdbSeries = {
  id: number;
  name: string;
  slug?: string;
  overview?: string;
  network?: string;
  status?: string;
  firstAired?: string;
  lastAired?: string;
  averageRuntime?: number;
  aliases: string[];
  originalLanguage?: string;
  originalCountry?: string;
};

let tokenInflight: Promise<string | null> | null = null;
let cachedToken: TokenCache | null = null;

function loadCachedToken(): TokenCache | null {
  if (cachedToken) return cachedToken;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    cachedToken = JSON.parse(raw) as TokenCache;
    return cachedToken;
  } catch {
    return null;
  }
}

function saveCachedToken(tc: TokenCache) {
  cachedToken = tc;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tc));
  } catch {
    /* ignore */
  }
}

async function getToken(apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  const cached = loadCachedToken();
  if (cached && cached.key === apiKey && Date.now() - cached.t < TOKEN_TTL_MS) {
    return cached.token;
  }
  if (tokenInflight) return tokenInflight;
  tokenInflight = (async () => {
    try {
      const res = await tauriFetch(`${BASE}/login`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ apikey: apiKey }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: { token?: string } };
      const token = j?.data?.token;
      if (!token) return null;
      saveCachedToken({ token, t: Date.now(), key: apiKey });
      return token;
    } catch {
      return null;
    } finally {
      tokenInflight = null;
    }
  })();
  return tokenInflight;
}

const RESPONSE_CACHE_MAX = 200;
const responseCache = new Map<string, unknown>();
const responseInflight = new Map<string, Promise<unknown>>();

registerCache("tvdb:response", () => responseCache.size);

async function getJson<T>(apiKey: string, path: string): Promise<T | null> {
  const key = `${apiKey.slice(0, 6)}::${path}`;
  if (responseCache.has(key)) return responseCache.get(key) as T;
  const existing = responseInflight.get(key);
  if (existing) return existing as Promise<T | null>;
  const p = (async (): Promise<T | null> => {
    const token = await getToken(apiKey);
    if (!token) return null;
    try {
      const res = await tauriFetch(`${BASE}${path}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (res.status === 401) {
        cachedToken = null;
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
        return null;
      }
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: T };
      const data = (j?.data ?? null) as T | null;
      if (data !== null) lruSet(responseCache, key, data, RESPONSE_CACHE_MAX);
      return data;
    } catch {
      return null;
    } finally {
      responseInflight.delete(key);
    }
  })();
  responseInflight.set(key, p as Promise<unknown>);
  return p;
}

export async function tvdbSeriesByImdb(apiKey: string, imdbId: string): Promise<number | null> {
  if (!apiKey || !imdbId.startsWith("tt")) return null;
  const data = await getJson<SearchHit[]>(apiKey, `/search/remoteid/${imdbId}`);
  if (!data) return null;
  const hit = data.find((h) => h.type === "series") ?? data[0];
  if (!hit?.tvdb_id) return null;
  const id = Number(hit.tvdb_id);
  return Number.isFinite(id) ? id : null;
}

export async function tvdbSeries(apiKey: string, seriesId: number): Promise<TvdbSeries | null> {
  if (!apiKey || !seriesId) return null;
  const data = await getJson<any>(apiKey, `/series/${seriesId}/extended?meta=translations&short=false`);
  if (!data) return null;
  const aliases: string[] = Array.from(
    new Set((data.aliases ?? []).map((a: any) => a?.name).filter(Boolean) as string[]),
  );
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    overview: data.overview,
    network: data.originalNetwork?.name ?? data.latestNetwork?.name,
    status: data.status?.name,
    firstAired: data.firstAired,
    lastAired: data.lastAired,
    averageRuntime: data.averageRuntime,
    aliases,
    originalLanguage: data.originalLanguage,
    originalCountry: data.originalCountry,
  };
}

export async function tvdbEpisodes(
  apiKey: string,
  seriesId: number,
  season: number,
): Promise<TvdbEpisode[]> {
  if (!apiKey || !seriesId) return [];
  const data = await getJson<any>(apiKey, `/series/${seriesId}/episodes/default?season=${season}`);
  const arr = data?.episodes ?? [];
  return (arr as any[])
    .filter((e) => typeof e.number === "number" && typeof e.seasonNumber === "number")
    .map((e) => ({
      id: e.id,
      number: e.number,
      seasonNumber: e.seasonNumber,
      name: e.name,
      overview: e.overview,
      aired: e.aired,
      runtime: e.runtime,
      image: e.image,
      imdbId: undefined,
    }));
}

export async function tvdbEpisodesAbsolute(
  apiKey: string,
  seriesId: number,
): Promise<TvdbEpisode[]> {
  if (!apiKey || !seriesId) return [];
  const out: TvdbEpisode[] = [];
  for (let page = 0; page < 12; page++) {
    const data = await getJson<any>(
      apiKey,
      `/series/${seriesId}/episodes/absolute?page=${page}`,
    );
    const arr = (data?.episodes ?? []) as any[];
    if (arr.length === 0) break;
    for (const e of arr) {
      if (typeof e.number !== "number") continue;
      out.push({
        id: e.id,
        number: e.number,
        seasonNumber: typeof e.seasonNumber === "number" ? e.seasonNumber : 0,
        absoluteNumber: typeof e.absoluteNumber === "number" ? e.absoluteNumber : undefined,
        name: e.name,
        overview: e.overview,
        aired: e.aired,
        runtime: e.runtime,
        image: e.image,
        imdbId: undefined,
      });
    }
    if (arr.length < 500) break;
  }
  return out;
}
