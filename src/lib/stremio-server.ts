import { invoke } from "@tauri-apps/api/core";

const STREMIO_SERVER_URL = "http://127.0.0.1:11470";
const PROBE_TIMEOUT_MS = 1500;
const PROBE_TTL_MS = 30_000;
const READY_WAIT_POLL_MS = 250;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function isBundledEngineUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost):11470\//i.test(url);
}

let probeCache: { ok: boolean; at: number } | null = null;

export type CastServerStatus = {
  bundled: boolean;
  running: boolean;
  ready: boolean;
  last_error: string | null;
  restart_count: number;
};

export async function getCastServerStatus(): Promise<CastServerStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<CastServerStatus>("cast_server_status");
  } catch {
    return null;
  }
}

export async function restartCastServer(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("cast_server_restart");
    probeCache = null;
    return true;
  } catch {
    return false;
  }
}

export async function awaitCastServerReady(timeoutMs = 5000): Promise<boolean> {
  if (!isTauri) return probeStremioServer();
  const status = await getCastServerStatus();
  if (!status?.bundled) return false;
  if (status.ready) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => window.setTimeout(r, READY_WAIT_POLL_MS));
    const s = await getCastServerStatus();
    if (s?.ready) return true;
    if (s && !s.running && s.restart_count >= 3) return false;
  }
  return false;
}

export async function probeStremioServer(force = false): Promise<boolean> {
  if (isTauri) {
    const status = await getCastServerStatus();
    if (status) {
      if (status.ready) return true;
      if (!status.bundled) return httpProbe(force);
      return false;
    }
  }
  return httpProbe(force);
}

async function httpProbe(force: boolean): Promise<boolean> {
  if (!force && probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
    return probeCache.ok;
  }
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${STREMIO_SERVER_URL}/settings`, {
      method: "GET",
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    const ok = res.ok;
    probeCache = { ok, at: Date.now() };
    return ok;
  } catch {
    probeCache = { ok: false, at: Date.now() };
    return false;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function buildTranscodedUrl(sourceUrl: string): string {
  const id = randomId();
  const params = new URLSearchParams();
  params.set("mediaURL", sourceUrl);
  params.set("videoCodecs", "h264");
  params.set("audioCodecs", "aac");
  params.set("audioChannels", "2");
  return `${STREMIO_SERVER_URL}/hlsv2/${id}/master.m3u8?${params.toString()}`;
}

export function getStremioServerUrl(): string {
  return STREMIO_SERVER_URL;
}
