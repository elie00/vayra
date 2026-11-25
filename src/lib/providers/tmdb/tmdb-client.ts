import { safeFetch } from "@/lib/safe-fetch";
import { registerEvictable } from "@/lib/maintenance";
import { imageRequestLang } from "./tmdb-image-lang";
import type { RequestDiagnostics } from "@/lib/request-outcome";

export const TMDB = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = { data: unknown; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown | null>>();

export function clearTmdbClientCache(): void {
  responseCache.clear();
}

function readCached(key: string): unknown | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    responseCache.delete(key);
    return undefined;
  }
  // Refresh LRU order.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.data;
}

function writeCached(key: string, data: unknown): void {
  if (responseCache.has(key)) responseCache.delete(key);
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  while (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

registerEvictable("tmdb-client-get", (aggressive) => {
  if (aggressive) {
    responseCache.clear();
    return;
  }
  const now = Date.now();
  for (const [k, v] of responseCache) {
    if (now >= v.expiresAt) responseCache.delete(k);
  }
  const target = Math.floor(CACHE_MAX_ENTRIES / 2);
  while (responseCache.size > target) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
});

let tmdbLanguage = "";

export function setTmdbLanguage(lang: string): void {
  tmdbLanguage = lang.trim();
}

function arabicModeActive(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement;
  return el.lang.toLowerCase().startsWith("ar") || el.dir === "rtl";
}

export function effectiveTmdbLanguage(): string {
  if (tmdbLanguage) return tmdbLanguage;
  return arabicModeActive() ? "ar" : "";
}

export function tmdbLanguageIso(): string {
  return effectiveTmdbLanguage().split("-")[0]?.toLowerCase() ?? "";
}

let lastFailureLogged = 0;
function logTmdbFailure(path: string, status: number, body: string): void {
  const now = Date.now();
  if (now - lastFailureLogged < 1000) return;
  lastFailureLogged = now;
  if (status === 401) {
    console.warn(`[tmdb] 401 unauthorized on ${path} — TMDB key invalid or revoked. ${body.slice(0, 200)}`);
  } else if (status === 429) {
    console.warn(`[tmdb] 429 rate-limited on ${path} — TMDB throttling this IP/key. ${body.slice(0, 200)}`);
  } else if (status === 404) {
    console.warn(`[tmdb] 404 not found on ${path} — TMDB does not have this resource.`);
  } else {
    console.warn(`[tmdb] ${status} on ${path} — ${body.slice(0, 200)}`);
  }
}

async function readJsonBody(res: Response, path: string): Promise<string> {
  if (typeof res.arrayBuffer !== "function") {
    return await res.text();
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const text = await new Response(stream).text();
      console.info(`[tmdb] gzip auto-decompressed ${path}: ${bytes.length} → ${text.length}`);
      return text;
    } catch (e) {
      console.warn(`[tmdb] DecompressionStream FAILED on ${path} (len=${bytes.length})`, e);
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function tmdbHttpFetch(url: string): Promise<Response> {
  return await safeFetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

async function fetchTmdbOnce<T>(
  url: string,
  path: string,
): Promise<{ status: number; data: T | null }> {
  const res = await tmdbHttpFetch(url);
  if (!res.ok) {
    const body = await readJsonBody(res, path).catch(() => "");
    logTmdbFailure(path, res.status, body);
    return { status: res.status, data: null };
  }
  const text = await readJsonBody(res, path);
  try {
    return { status: 200, data: JSON.parse(text) as T };
  } catch (e) {
    const preview = JSON.stringify(text.slice(0, 200));
    console.warn(`[tmdb] parse failure on ${path} (len=${text.length}, starts=${preview})`, e);
    throw new Error("tmdb-parse-failure");
  }
}

async function fetchTmdbWithRetries<T>(target: string, path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { status, data } = await fetchTmdbOnce<T>(target, path);
      if (status === 429 || (status >= 500 && status < 600)) {
        await new Promise((r) => setTimeout(r, Math.min(2000, 250 * 2 ** attempt)));
        continue;
      }
      if (data !== null) writeCached(target, data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "tmdb-parse-failure") {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      console.warn(`[tmdb] network error on ${path}`, e);
      return null;
    }
  }
  return null;
}

export async function get<T>(
  key: string,
  path: string,
  params: Record<string, string> = {},
  diagnostics?: RequestDiagnostics,
): Promise<T | null> {
  if (!key) return null;
  const url = new URL(`${TMDB}/${path}`);
  url.searchParams.set("api_key", key);
  const lang = effectiveTmdbLanguage() || imageRequestLang();
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  if (lang && !params.language) url.searchParams.set("language", lang);
  for (const [k, v] of entries) url.searchParams.set(k, v);
  const target = url.toString();

  const cached = readCached(target);
  if (cached !== undefined) return cached as T;

  let pending = inflightRequests.get(target) as Promise<T | null> | undefined;
  if (!pending) {
    pending = fetchTmdbWithRetries<T>(target, path).finally(() => {
      if (inflightRequests.get(target) === pending) inflightRequests.delete(target);
    });
    inflightRequests.set(target, pending);
  }
  const data = await pending;
  if (!data && diagnostics) diagnostics.failed = true;
  return data;
}
