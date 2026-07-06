// Discovery and parsing of Kodi / TinyMediaManager sidecar files that live next
// to a video file: a `.nfo` metadata document and local poster/backdrop/logo
// artwork. Everything here runs against the real filesystem via the Tauri fs
// plugin, so it only works inside the desktop app.

export type LocalArt = { poster?: string; logo?: string; backdrop?: string };

export type ParsedNfo = {
  title?: string;
  year?: number | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  plot?: string | null;
  // The series title, present on per-episode <episodedetails> .nfo files whose
  // own <title> is the episode name. Used to recover the show name when no
  // folder-level tvshow.nfo is available.
  showTitle?: string;
  rating?: number | null;
  runtime?: number | null;
  // Artwork the .nfo itself references (TinyMediaManager/Kodi embed TMDB URLs in
  // <thumb>/<fanart> tags). May be remote URLs or local paths.
  art?: LocalArt;
};

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function pathMod() {
  return await import("@tauri-apps/api/path");
}

// Directory + extension-less stem for a video file path.
async function splitVideoPath(videoPath: string): Promise<{ dir: string; stem: string }> {
  const p = await pathMod();
  const dir = await p.dirname(videoPath);
  const base = await p.basename(videoPath);
  const stem = base.replace(/\.[^.]+$/, "");
  return { dir, stem };
}

// Per-scan cache of directory listings, so probing many files in the same folder
// costs one readDir. Cleared at the start of a scan and after writing artwork.
const dirCache = new Map<string, Map<string, string>>();

export function clearSidecarCache(): void {
  dirCache.clear();
}

// Case-insensitive listing of a directory as a lowercase-name -> actual-name map.
async function dirIndex(dir: string): Promise<Map<string, string>> {
  const cached = dirCache.get(dir);
  if (cached) return cached;
  const out = new Map<string, string>();
  if (!isTauri) return out;
  try {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(dir);
    for (const e of entries) {
      if (e.isFile) out.set(e.name.toLowerCase(), e.name);
    }
  } catch {
    /* unreadable dir — treat as empty */
  }
  dirCache.set(dir, out);
  return out;
}

// How many of the given video files have an adjacent .nfo sidecar. Used to hint
// the scan-mode popup. Directory listings are cached, so this is cheap.
export async function countNfoFor(videoPaths: string[]): Promise<number> {
  if (!isTauri) return 0;
  let count = 0;
  for (const p of videoPaths) {
    if (await findNfo(p)) count += 1;
  }
  return count;
}

// Resolve the first candidate filename that exists in the directory index,
// returning the absolute path (preserving the real on-disk casing).
async function resolveIn(
  dir: string,
  index: Map<string, string>,
  candidates: string[],
): Promise<string | null> {
  const p = await pathMod();
  for (const cand of candidates) {
    const actual = index.get(cand.toLowerCase());
    if (actual) return await p.join(dir, actual);
  }
  return null;
}

// The video's own directory and its parent — TV episodes usually live in a
// `Season NN` / `SNN` subfolder while the series-level tvshow.nfo and artwork
// (poster.jpg, fanart.jpg, seasonNN-poster.jpg …) sit one level up.
async function dirAndParent(dir: string): Promise<string[]> {
  const p = await pathMod();
  const parent = await p.dirname(dir);
  return parent && parent !== dir ? [dir, parent] : [dir];
}

// Resolve the first candidate across several directories, nearest dir first.
async function resolveInDirs(dirs: string[], candidates: string[]): Promise<string | null> {
  for (const dir of dirs) {
    const hit = await resolveIn(dir, await dirIndex(dir), candidates);
    if (hit) return hit;
  }
  return null;
}

// Find the .nfo sidecar for a video: `<stem>.nfo` first, then a folder-level
// `movie.nfo` / `tvshow.nfo`.
export async function findNfo(videoPath: string): Promise<string | null> {
  if (!isTauri) return null;
  const { dir, stem } = await splitVideoPath(videoPath);
  const index = await dirIndex(dir);
  return resolveIn(dir, index, [`${stem}.nfo`, "movie.nfo", "tvshow.nfo"]);
}

// Find local poster / backdrop / logo artwork next to a video, following the
// common Kodi naming conventions (stem-prefixed first, then folder-level).
export async function findLocalArt(videoPath: string): Promise<LocalArt> {
  if (!isTauri) return {};
  const { dir, stem } = await splitVideoPath(videoPath);
  const index = await dirIndex(dir);
  const [poster, backdrop, logo] = await Promise.all([
    resolveIn(dir, index, [
      `${stem}-poster.jpg`, `${stem}-poster.png`, "poster.jpg", "poster.png", "folder.jpg", "cover.jpg",
    ]),
    resolveIn(dir, index, [
      `${stem}-fanart.jpg`, `${stem}-fanart.png`, "fanart.jpg", "fanart.png", "backdrop.jpg",
    ]),
    resolveIn(dir, index, [
      `${stem}-clearlogo.png`, `${stem}-logo.png`, "clearlogo.png", "logo.png",
    ]),
  ]);
  const art: LocalArt = {};
  if (poster) art.poster = poster;
  if (backdrop) art.backdrop = backdrop;
  if (logo) art.logo = logo;
  return art;
}

// Find the series-level tvshow.nfo for an episode file: in the episode's own
// directory, else one level up (the common `Show/Season NN/episode` layout).
export async function findShowNfo(videoPath: string): Promise<string | null> {
  if (!isTauri) return null;
  const { dir } = await splitVideoPath(videoPath);
  return resolveInDirs(await dirAndParent(dir), ["tvshow.nfo"]);
}

// Find series-level artwork for an episode file. Uses the whole-series poster
// (poster.jpg/folder.jpg) — NOT a per-season poster, which is the wrong image
// for a series card — and only falls back to a season poster when no series
// poster exists at all. Searches the parent directory too, since art usually
// lives beside tvshow.nfo rather than next to the video.
export async function findShowArt(
  videoPath: string,
  season: number | null,
): Promise<LocalArt> {
  if (!isTauri) return {};
  const { dir } = await splitVideoPath(videoPath);
  const dirs = await dirAndParent(dir);
  const seasonTag =
    season != null ? `season${String(season).padStart(2, "0")}-poster` : null;
  const posterNames = [
    "poster.jpg", "poster.png", "folder.jpg", "cover.jpg",
    ...(seasonTag ? [`${seasonTag}.jpg`, `${seasonTag}.png`] : []),
  ];
  const [poster, backdrop, logo] = await Promise.all([
    resolveInDirs(dirs, posterNames),
    resolveInDirs(dirs, ["fanart.jpg", "fanart.png", "backdrop.jpg"]),
    resolveInDirs(dirs, ["clearlogo.png", "logo.png"]),
  ]);
  const art: LocalArt = {};
  if (poster) art.poster = poster;
  if (backdrop) art.backdrop = backdrop;
  if (logo) art.logo = logo;
  return art;
}

// Read + parse a .nfo file at the given path. Returns null when unreadable.
export async function readNfo(nfoPath: string): Promise<ParsedNfo | null> {
  if (!isTauri) return null;
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const xml = await readTextFile(nfoPath);
    return parseNfo(xml);
  } catch {
    return null;
  }
}

// Parse a Kodi-style .nfo XML string. Handles <movie>, <tvshow>, and
// <episodedetails> roots and the various id encodings TMM/Kodi have used.
export function parseNfo(xml: string): ParsedNfo {
  const out: ParsedNfo = {};
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "text/xml");
  } catch {
    return out;
  }
  if (doc.querySelector("parsererror")) return out;

  const text = (sel: string): string | undefined =>
    doc.querySelector(sel)?.textContent?.trim() || undefined;

  out.title = text("title") ?? text("originaltitle");
  out.showTitle = text("showtitle");

  const yearRaw =
    text("year") ??
    (text("premiered") || text("aired") || text("releasedate"))?.slice(0, 4);
  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN;
  out.year = Number.isFinite(yearNum) ? yearNum : null;

  out.plot = text("plot") ?? text("outline") ?? null;

  // rating: a plain <rating> or the default <ratings><rating><value>.
  const ratingRaw =
    text("rating") ?? doc.querySelector("ratings rating value")?.textContent?.trim();
  const ratingNum = ratingRaw ? parseFloat(ratingRaw) : NaN;
  out.rating = Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : null;

  // runtime in minutes (strip any stray non-digits).
  const runtimeRaw = text("runtime");
  const runtimeNum = runtimeRaw ? parseInt(runtimeRaw.replace(/\D/g, ""), 10) : NaN;
  out.runtime = Number.isFinite(runtimeNum) && runtimeNum > 0 ? runtimeNum : null;

  // ids: prefer <uniqueid type="..."> then legacy <tmdbid>/<imdbid>/<id>.
  let tmdb: string | undefined;
  let imdb: string | undefined;
  for (const el of Array.from(doc.querySelectorAll("uniqueid"))) {
    const type = el.getAttribute("type")?.toLowerCase();
    const val = el.textContent?.trim();
    if (!val) continue;
    if (type === "tmdb") tmdb = val;
    else if (type === "imdb") imdb = val;
  }
  tmdb = tmdb ?? text("tmdbid");
  imdb = imdb ?? text("imdbid");
  const legacyId = text("id");
  if (!imdb && legacyId && legacyId.startsWith("tt")) imdb = legacyId;
  if (!tmdb && legacyId && /^\d+$/.test(legacyId)) tmdb = legacyId;

  const tmdbNum = tmdb ? parseInt(tmdb, 10) : NaN;
  out.tmdbId = Number.isFinite(tmdbNum) ? tmdbNum : null;
  out.imdbId = imdb && imdb.startsWith("tt") ? imdb : null;

  out.art = parseNfoArt(doc);

  return out;
}

// Extract poster/logo/backdrop from a .nfo's <thumb>/<fanart> tags. Movies carry a
// plain <thumb aspect="poster">; TV shows often carry ONLY per-season posters, which
// are the wrong image for a whole-series card — so we take only a non-season poster
// here and let the series poster be fetched from TMDB otherwise. Values are usually
// TMDB URLs.
function parseNfoArt(doc: Document): LocalArt | undefined {
  const thumbs = Array.from(doc.querySelectorAll("thumb"));
  const val = (el: Element | undefined) => el?.textContent?.trim() || undefined;
  const byAspect = (aspect: string) =>
    thumbs.filter((el) => el.getAttribute("aspect") === aspect);

  const poster = val(byAspect("poster").find((el) => !el.getAttribute("season")));

  const logo = val(byAspect("clearlogo")[0] ?? byAspect("logo")[0] ?? byAspect("clearart")[0]);

  const backdrop =
    val(doc.querySelector("fanart thumb") ?? undefined) ?? val(byAspect("landscape")[0]);

  const art: LocalArt = {};
  if (poster) art.poster = poster;
  if (logo) art.logo = logo;
  if (backdrop) art.backdrop = backdrop;
  return art.poster || art.logo || art.backdrop ? art : undefined;
}
