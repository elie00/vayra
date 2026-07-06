import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";

const KEY = "harbor.library.local.v1";
const subs = new Set<() => void>();

export type LocalEntry = {
  id: string;
  path: string;
  filename: string;
  title: string;
  year: number | null;
  type: "movie" | "show";
  resolution?: string | null;
  // TMDB/​.nfo rating (0–10) and runtime in minutes, captured at scan time so the
  // Local library can sort by rating / duration without re-fetching.
  rating?: number | null;
  runtime?: number | null;
  poster?: string | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  season?: number | null;
  episode?: number | null;
  addedAt: number;
  // True when the scan could not confidently identify the title, so it lands in
  // the "Needs review" queue until the user picks the right match.
  needsReview?: boolean;
  // Where the metadata came from: a TMDB match, or a local .nfo sidecar.
  source?: "tmdb" | "nfo";
  // Absolute paths to artwork saved next to the file (from a .nfo import or an
  // export). Shown via convertFileSrc so they work offline.
  localArt?: { poster?: string; logo?: string; backdrop?: string };
};

function read(): LocalEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as LocalEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LocalEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* noop */
  }
  for (const s of subs) s();
}

export function readLocalLibrary(): LocalEntry[] {
  return read();
}

export function localShowEpisodes(show: { imdbId?: string | null; title?: string | null }): LocalEntry[] {
  const wantImdb = show.imdbId ?? null;
  const wantTitle = (show.title ?? "").trim().toLowerCase();
  return read()
    .filter((e) => {
      if (e.type !== "show" || e.season == null || e.episode == null) return false;
      if (wantImdb) return e.imdbId === wantImdb;
      return !!wantTitle && e.title.trim().toLowerCase() === wantTitle;
    })
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
}

export function findLocalEpisode(
  show: { imdbId?: string | null; title?: string | null },
  season: number,
  episode: number,
): LocalEntry | null {
  return (
    localShowEpisodes(show).find((e) => e.season === season && e.episode === episode) ?? null
  );
}

export function addLocalEntries(entries: LocalEntry[]): void {
  if (entries.length === 0) return;
  const existing = read();
  const byPath = new Map(existing.map((e) => [e.path, e]));
  for (const e of entries) byPath.set(e.path, e);
  write(Array.from(byPath.values()).sort((a, b) => b.addedAt - a.addedAt));
}

export function removeLocalEntry(id: string): void {
  write(read().filter((e) => e.id !== id));
}

// Patch a single entry in place (used when the user resolves a "Needs review"
// match or after exporting artwork). Preserves list order.
export function updateLocalEntry(id: string, patch: Partial<LocalEntry>): void {
  updateLocalEntries([id], patch);
}

// Patch many entries with the same fields in one write — used to apply a resolved
// series match to every one of its episodes at once.
export function updateLocalEntries(ids: string[], patch: Partial<LocalEntry>): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  let changed = false;
  const next = read().map((e) => {
    if (!idSet.has(e.id)) return e;
    changed = true;
    return { ...e, ...patch };
  });
  if (changed) write(next);
}

export function clearLocalLibrary(): void {
  write([]);
}

// The first local movie file matching a TMDB or IMDb id.
export function findLocalMovie(
  tmdbId?: number | null,
  imdbId?: string | null,
): LocalEntry | null {
  return (
    read().find(
      (e) =>
        e.type === "movie" &&
        ((tmdbId != null && e.tmdbId === tmdbId) || (imdbId != null && e.imdbId === imdbId)),
    ) ?? null
  );
}

// The local file for a specific episode of a series, matched by series id + S/E.
// (Named *ByIds to avoid clashing with the show-object-keyed findLocalEpisode
// above that the player's next-episode navigation depends on.)
export function findLocalEpisodeByIds(
  season: number,
  episode: number,
  tmdbId?: number | null,
  imdbId?: string | null,
): LocalEntry | null {
  return (
    read().find(
      (e) =>
        e.type === "show" &&
        e.season === season &&
        e.episode === episode &&
        ((tmdbId != null && e.tmdbId === tmdbId) || (imdbId != null && e.imdbId === imdbId)),
    ) ?? null
  );
}

// All local episode files belonging to a series (matched by tmdb OR imdb id),
// sorted by season then episode. Used to build the availability grid and to
// decide whether a series' detail Play should surface local episodes.
export function findLocalSeriesEpisodes(
  tmdbId?: number | null,
  imdbId?: string | null,
): LocalEntry[] {
  if (tmdbId == null && imdbId == null) return [];
  return read()
    .filter(
      (e) =>
        e.type === "show" &&
        ((tmdbId != null && e.tmdbId === tmdbId) || (imdbId != null && e.imdbId === imdbId)),
    )
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
}

// Build a catalog Meta for a local entry so it can open its detail page. Returns
// null for unidentified entries (no TMDB/IMDb id → no detail page exists).
export function localEntryToMeta(entry: LocalEntry): Meta | null {
  const kind = entry.type === "show" ? "tv" : "movie";
  const id = entry.tmdbId != null ? `tmdb:${kind}:${entry.tmdbId}` : entry.imdbId ?? null;
  if (!id) return null;
  return {
    id,
    type: entry.type === "show" ? "series" : "movie",
    name: entry.title,
    poster: entry.poster ?? undefined,
  };
}

export function useLocalLibrary(): LocalEntry[] {
  const [items, setItems] = useState<LocalEntry[]>(() => read());
  useEffect(() => {
    const tick = () => setItems(read());
    subs.add(tick);
    return () => {
      subs.delete(tick);
    };
  }, []);
  return items;
}

// The set of catalog ids that are backed by a file on disk — a `tmdb:movie:123`
// / `tmdb:tv:123` per resolved TMDB id (tv covers the store's "show" type) plus
// the raw imdb id. Used to light up an "on disk" badge on catalog cards.
function localLibraryIdSet(): Set<string> {
  const out = new Set<string>();
  for (const e of read()) {
    if (e.tmdbId != null) {
      const kind = e.type === "show" ? "tv" : "movie";
      out.add(`tmdb:${kind}:${e.tmdbId}`);
    }
    if (e.imdbId) out.add(e.imdbId);
  }
  return out;
}

// Mirrors useInWatchlist: true when a catalog Meta (by its id or any alt imdb id)
// matches a scanned local entry. Re-checks on store changes.
export function useInLocalLibrary(
  id: string | undefined,
  altIds?: Array<string | null | undefined>,
): boolean {
  const candidates = useMemo(() => {
    const arr: string[] = [];
    if (id) arr.push(id);
    if (altIds) for (const a of altIds) if (a) arr.push(a);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, altIds?.join("|")]);

  const check = () => {
    if (candidates.length === 0) return false;
    const set = localLibraryIdSet();
    return candidates.some((c) => set.has(c));
  };

  const [has, setHas] = useState<boolean>(check);
  useEffect(() => {
    setHas(check());
    const tick = () => setHas(check());
    subs.add(tick);
    return () => {
      subs.delete(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.join("|")]);
  return has;
}

const VIDEO_EXTS = new Set([
  "mkv", "mp4", "m4v", "mov", "avi", "wmv", "webm", "ts", "m2ts", "mpg", "mpeg", "flv", "ogv",
]);

export function isVideoFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.has(ext);
}

const NOISE = [
  "1080p", "720p", "2160p", "4k", "uhd", "hdr", "hdr10", "dv",
  "bluray", "bdrip", "brrip", "webrip", "web-dl", "webdl", "hdtv", "dvdrip", "remux",
  "x264", "x265", "h264", "h265", "hevc", "av1", "10bit",
  "atmos", "ddp", "dts", "ac3", "aac",
  "yify", "yts", "rarbg", "fgt", "evo", "psa",
];
const NOISE_RX = new RegExp(`\\b(${NOISE.join("|")})\\b`, "gi");
// Episode markers, tolerant of separators and word forms: S01E07, S01 E07,
// S01.E07, S01-E07, 1x07, "Season 1 Episode 7". Still requires an explicit S/E or
// NxNN marker so movie titles (Se7en, 1917, 300) never false-match.
const TV_RX =
  /\bs(\d{1,2})[\s._-]*e(\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b|\bseason[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep)[\s._-]*(\d{1,3})\b/i;
const YEAR_RX = /\b(19\d{2}|20\d{2})\b/;

export type ParsedFilename = {
  title: string;
  year: number | null;
  type: "movie" | "show";
  season: number | null;
  episode: number | null;
  resolution: string | null;
};

export function parseFilename(filename: string): ParsedFilename {
  const stem = filename.replace(/\.(mkv|mp4|m4v|mov|avi|wmv|webm|ts|m2ts|mpg|mpeg|flv|ogv)$/i, "");
  const tv = stem.match(TV_RX);
  const season = tv ? parseInt(tv[1] ?? tv[3] ?? tv[5], 10) : null;
  const episode = tv ? parseInt(tv[2] ?? tv[4] ?? tv[6], 10) : null;
  const yearMatch = stem.match(YEAR_RX);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const resMatch = stem.match(/\b(2160p|1080p|720p|480p|4k|uhd)\b/i);
  const resolution = resMatch ? resMatch[1].toLowerCase() : null;
  let title = stem;
  if (tv) title = title.slice(0, tv.index);
  if (yearMatch && yearMatch.index != null && yearMatch.index < title.length) {
    title = title.slice(0, yearMatch.index);
  }
  title = title
    .replace(/[._]+/g, " ")
    .replace(NOISE_RX, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\[\(\{].*?[\]\)\}]/g, "")
    // Drop any leftover stray brackets (e.g. a lone "(" where the year was sliced
    // off) and trailing separators, so the fallback title reads cleanly.
    .replace(/[\[\](){}]/g, " ")
    .replace(/[\s\-–—_]+$/g, "")
    .replace(/^[\s\-–—_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) title = stem;
  return {
    title,
    year,
    type: tv ? "show" : "movie",
    season,
    episode,
    resolution,
  };
}
