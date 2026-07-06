import { useEffect, useState } from "react";

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
  poster?: string | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  season?: number | null;
  episode?: number | null;
  addedAt: number;
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

export function clearLocalLibrary(): void {
  write([]);
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
const TV_RX = /\bs(\d{1,2})e(\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b/i;
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
  const season = tv ? parseInt(tv[1] ?? tv[3], 10) : null;
  const episode = tv ? parseInt(tv[2] ?? tv[4], 10) : null;
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
