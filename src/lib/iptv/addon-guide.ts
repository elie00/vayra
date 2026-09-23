import { safeFetch } from "@/lib/safe-fetch";
import type { Addon } from "@/lib/addons";
import type { Meta } from "@/lib/cinemeta";
import { programmesOf } from "@/lib/addon-epg";
import type { EpgIndex, EpgProgram, IptvChannel, IptvPlaylist, IptvPlaylistSource } from "./types";

/**
 * Stremio native EPG providers (stremio-addon-sdk docs/epg.md) shown in Live next to
 * IPTV playlists. A guide catalog is a `tv` catalog with a `date` extra; asking it for
 * a UTC day returns `{ metasDetailed }`, channels with that day's programmes in
 * `videos`. Streams are resolved per channel id when the channel is played.
 */

export type FetchJson = (url: string) => Promise<unknown>;

const MAX_PAGES = 50;

function addonBase(transportUrl: string): string {
  return transportUrl.replace(/\/manifest\.json$/, "");
}

export function epgAddonSources(addons: Addon[]): IptvPlaylistSource[] {
  const out: IptvPlaylistSource[] = [];
  for (const addon of addons) {
    if (addon.manifest.behaviorHints?.epgProvider !== true) continue;
    const base = addonBase(addon.transportUrl);
    for (const cat of addon.manifest.catalogs ?? []) {
      if (cat.type !== "tv" || !(cat.extra ?? []).some((e) => e.name === "date")) continue;
      out.push({
        id: `addon-epg:${addon.manifest.id}:${cat.id}`,
        name: addon.manifest.name,
        url: base,
        kind: "addon",
        addon: { base, catalogId: cat.id, type: cat.type },
      });
    }
  }
  return out;
}

/** The UTC calendar days (YYYY-MM-DD) that the window [fromMs, toMs] overlaps. */
export function utcDatesForWindow(fromMs: number, toMs: number): string[] {
  const days: string[] = [];
  const day = new Date(fromMs);
  day.setUTCHours(0, 0, 0, 0);
  for (let t = day.getTime(); t <= toMs; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** One guide day, paging with `skip` until the addon returns an empty page. */
export async function fetchGuideDay(
  fetchJson: FetchJson,
  base: string,
  type: string,
  catalogId: string,
  date: string,
): Promise<Meta[]> {
  const metas: Meta[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const extra = metas.length > 0 ? `date=${date}&skip=${metas.length}` : `date=${date}`;
    const json = (await fetchJson(`${base}/catalog/${type}/${catalogId}/${extra}.json`)) as
      | { metasDetailed?: Meta[] }
      | null;
    const batch = json?.metasDetailed ?? [];
    if (batch.length === 0) break;
    metas.push(...batch);
  }
  return metas;
}

function channelKey(src: IptvPlaylistSource, metaId: string): string {
  return `${src.id}:${metaId}`;
}

/** Channels (merged across days) as Live channels, and their programmes as an EPG. */
export function guideFromMetas(
  src: IptvPlaylistSource,
  metas: Meta[],
  fetchedAt: number,
): { playlist: IptvPlaylist; epg: EpgIndex } {
  const channels = new Map<string, IptvChannel>();
  const programmes = new Map<string, Map<string, EpgProgram>>();
  for (const meta of metas) {
    const key = channelKey(src, meta.id);
    if (!channels.has(key)) {
      channels.set(key, {
        id: key,
        tvgId: key,
        name: meta.name,
        logo: meta.logo ?? meta.poster ?? null,
        group: src.name,
        url: "",
        catchupSource: null,
        durationSec: null,
        attrs: {
          "addon-base": src.addon?.base ?? src.url,
          "addon-channel-id": meta.id,
          "addon-type": src.addon?.type ?? "tv",
        },
      });
    }
    let byId = programmes.get(key);
    if (!byId) {
      byId = new Map();
      programmes.set(key, byId);
    }
    for (const p of programmesOf(meta.videos)) {
      byId.set(p.id, {
        channelTvgId: key,
        title: p.title,
        description: p.overview ?? null,
        startMs: p.startMs,
        endMs: p.endMs,
        category: null,
        iconUrl: p.thumbnail ?? null,
      });
    }
  }
  const byChannel = new Map<string, EpgProgram[]>();
  for (const [key, byId] of programmes) {
    byChannel.set(key, [...byId.values()].sort((a, b) => a.startMs - b.startMs));
  }
  const list = [...channels.values()];
  return {
    playlist: { id: src.id, name: src.name, url: src.url, epgUrl: null, channels: list, fetchedAt, groups: [src.name] },
    epg: { byChannel, fetchedAt },
  };
}

export function isAddonChannel(ch: IptvChannel): boolean {
  return !!ch.attrs["addon-base"] && !!ch.attrs["addon-channel-id"];
}

type AddonStream = {
  url?: string;
  behaviorHints?: { proxyHeaders?: { request?: Record<string, string> } };
};

/** The channel's first stream with a URL, asked of its addon by channel id. */
export async function resolveAddonChannelStream(
  fetchJson: FetchJson,
  ch: IptvChannel,
): Promise<{ url: string; headers?: Record<string, string> } | null> {
  const base = ch.attrs["addon-base"];
  const id = ch.attrs["addon-channel-id"];
  if (!base || !id) return null;
  const type = ch.attrs["addon-type"] || "tv";
  const json = (await fetchJson(`${base}/stream/${type}/${encodeURIComponent(id)}.json`)) as
    | { streams?: AddonStream[] }
    | null;
  const stream = (json?.streams ?? []).find((s) => typeof s.url === "string" && s.url.length > 0);
  if (!stream?.url) return null;
  return { url: stream.url, headers: stream.behaviorHints?.proxyHeaders?.request };
}

const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchAddonJson(url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { signal: ac.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The guide for the next day, every overlapping UTC day requested and merged. */
export async function loadAddonGuide(
  src: IptvPlaylistSource,
  fetchJson: FetchJson = fetchAddonJson,
  nowMs = Date.now(),
): Promise<{ playlist: IptvPlaylist; epg: EpgIndex }> {
  const a = src.addon;
  if (!a) throw new Error("Not an addon guide source");
  const dates = utcDatesForWindow(nowMs - 2 * 60 * 60 * 1000, nowMs + 24 * 60 * 60 * 1000);
  const days = await Promise.all(dates.map((d) => fetchGuideDay(fetchJson, a.base, a.type, a.catalogId, d)));
  return guideFromMetas(src, days.flat(), nowMs);
}
