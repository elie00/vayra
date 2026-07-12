import { parse } from "parse-torrent-title";
import type { DebridSlug, DebridStore, LibraryEntry } from "@/lib/debrid/types";
import type { Stream } from "./types";

export type LibraryQuery = {
  type: "movie" | "series";
  imdbId: string;
  title: string;
  year?: number;
  season?: number;
  episode?: number;
};

// Per-debrid cap so one slow/hung debrid can't stall library collection.
const LIBRARY_TIMEOUT_MS = 8000;

export async function fetchLibraryStreams(
  clients: DebridStore[],
  query: LibraryQuery,
  signal: AbortSignal,
): Promise<Stream[]> {
  if (clients.length === 0) return [];
  // Collect per-debrid as each returns; bound each lookup with a timeout so a
  // slow debrid can't stall the batch. Final result is order-independent.
  const perClient = await Promise.all(
    clients.map(async (c) => {
      const slug = c.slug;
      let timer: ReturnType<typeof setTimeout>;
      const guard = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LIBRARY_TIMEOUT_MS);
      });
      let r: Awaited<ReturnType<DebridStore["listLibrary"]>> | null;
      try {
        r = await Promise.race([c.listLibrary(signal), guard]);
      } catch {
        r = null;
      } finally {
        clearTimeout(timer!);
      }
      if (!r || !r.ok) return [];
      const streams: Stream[] = [];
      for (const entry of r.data) {
        if (!entry.hash) continue;
        const matched = matchEntry(entry, query);
        if (!matched) continue;
        streams.push(buildLibraryStream(slug, entry, matched));
      }
      return streams;
    }),
  );
  return perClient.flat();
}

function matchEntry(entry: LibraryEntry, query: LibraryQuery): MatchInfo | null {
  if (entry.files && entry.files.length > 0) {
    for (let idx = 0; idx < entry.files.length; idx++) {
      const f = entry.files[idx];
      const m = checkText(f.name, query, idx);
      if (m) return m;
    }
  }
  return checkText(entry.name, query, undefined);
}

function checkText(
  text: string,
  query: LibraryQuery,
  fileIdx: number | undefined,
): MatchInfo | null {
  const ptt = parse(text);
  if (
    query.type === "movie" &&
    query.year != null &&
    ptt.year != null &&
    Math.abs(ptt.year - query.year) > 1
  ) {
    return null;
  }
  if (query.season != null && ptt.season != null && ptt.season !== query.season) return null;
  if (query.episode != null && ptt.episode != null && ptt.episode !== query.episode) return null;
  if (query.type === "series" && (query.season != null || query.episode != null)) {
    if (ptt.season == null && ptt.episode == null) return null;
  }
  const a = normalize(query.title);
  const b = normalize(ptt.title ?? text);
  if (a.length < 2 || b.length < 2) return null;
  if (!b.includes(a) && !a.includes(b)) return null;
  return {
    fileIdx,
    parsedTitle: ptt.title ?? text,
    resolution: ptt.resolution,
    codec: ptt.codec,
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\s\.\-_\(\)\[\]:;,!?'"‘’“”–—]+/g, "");
}

function buildLibraryStream(slug: DebridSlug, entry: LibraryEntry, m: MatchInfo): Stream {
  const filename = entry.files?.[m.fileIdx ?? 0]?.name ?? entry.name;
  const cacheTag = `[${slug.toUpperCase()}+]`;
  return {
    name: filename,
    title: `${cacheTag} ${displayName(slug)} Library`,
    infoHash: entry.hash,
    fileIdx: m.fileIdx,
    addonId: `${slug}-library`,
    addonName: `${displayName(slug)} Library`,
  };
}

function displayName(slug: DebridSlug): string {
  if (slug === "rd") return "Real-Debrid";
  if (slug === "tb") return "TorBox";
  if (slug === "ad") return "AllDebrid";
  if (slug === "pm") return "Premiumize";
  return "Debrid-Link";
}

type MatchInfo = {
  fileIdx: number | undefined;
  parsedTitle: string;
  resolution?: string;
  codec?: string;
};
