import type { Meta } from "@/lib/cinemeta";
import type { LibraryItem } from "@/lib/stremio";
import type { Settings } from "@/lib/settings";
import { buildTmdbSpecs } from "./home-rows";
import type { HomeRow } from "./home-types";

const SNAPSHOT_VERSION = 1;
const HOME_SNAPSHOT_KEY = "vayra.home.snapshot.v1";
const LIBRARY_SNAPSHOT_KEY = "vayra.home.library.v1";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_SNAPSHOT_ROWS = 14;
const MAX_METAS_PER_ROW = 20;
const MAX_HERO_METAS = 6;
const MAX_LIBRARY_ITEMS = 120;

type SerializedHomeRow = {
  key: string;
  type: "movie" | "series";
  name: string;
  metas: Meta[];
  noDedup?: boolean;
};

type HomeSnapshotPayload = {
  v: number;
  scope: string;
  savedAt: number;
  rows: SerializedHomeRow[];
  hero: Meta[];
};

type LibrarySnapshotPayload = {
  v: number;
  userId: string;
  savedAt: number;
  items: LibraryItem[];
};

export function homeSnapshotScope(settings: Settings, uiLang: string): string {
  return [
    settings.homeMode,
    uiLang,
    settings.tmdbLanguage ?? "",
    settings.region ?? "",
    settings.tmdbKey ? "1" : "0",
    settings.homeShowAllAddonRows ? "1" : "0",
  ].join("|");
}

function trimMeta(m: Meta, includeDescription: boolean): Meta {
  const out: Meta = {
    id: m.id,
    type: m.type,
    name: m.name,
  };
  if (m.poster) out.poster = m.poster;
  if (m.background) out.background = m.background;
  if (m.logo) out.logo = m.logo;
  if (includeDescription && m.description) {
    out.description = m.description.length > 360 ? `${m.description.slice(0, 357)}…` : m.description;
  }
  if (m.releaseInfo) out.releaseInfo = m.releaseInfo;
  if (m.releaseDate) out.releaseDate = m.releaseDate;
  if (m.imdbRating) out.imdbRating = m.imdbRating;
  if (m.inTheaters) out.inTheaters = m.inTheaters;
  if (m.originalLanguage) out.originalLanguage = m.originalLanguage;
  if (m.country) out.country = m.country;
  if (m.genres && m.genres.length > 0) out.genres = m.genres.slice(0, 4);
  if (m.addonOrigin) {
    out.addonOrigin = {
      id: m.addonOrigin.id,
      name: m.addonOrigin.name,
      logo: m.addonOrigin.logo,
      base: m.addonOrigin.base,
    };
  }
  return out;
}

export function readHomeSnapshot(
  settings: Settings,
  uiLang: string,
): { rows: HomeRow[]; hero: Meta[] } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOME_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeSnapshotPayload;
    if (
      !parsed ||
      parsed.v !== SNAPSHOT_VERSION ||
      parsed.scope !== homeSnapshotScope(settings, uiLang) ||
      !Number.isFinite(parsed.savedAt) ||
      Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    const specByKey = settings.tmdbKey
      ? new Map(buildTmdbSpecs(settings).map((s) => [s.key, s]))
      : null;
    const rows: HomeRow[] = parsed.rows
      .filter((r) => r && typeof r.key === "string" && Array.isArray(r.metas) && r.metas.length > 0)
      .map((r) => {
        const spec = specByKey?.get(r.key);
        return {
          key: r.key,
          type: r.type === "series" ? "series" : "movie",
          name: r.name,
          metas: r.metas,
          page: 1,
          hasMore: !!spec,
          noDedup: r.noDedup,
          fetcher: spec?.fetcher,
        };
      });
    const hero = Array.isArray(parsed.hero) ? parsed.hero : [];
    if (rows.length === 0 && hero.length === 0) return null;
    return { rows, hero };
  } catch {
    return null;
  }
}

export function writeHomeSnapshot(
  settings: Settings,
  uiLang: string,
  rows: HomeRow[],
  hero: Meta[],
): void {
  if (typeof localStorage === "undefined") return;
  const serializedRows: SerializedHomeRow[] = rows
    .filter((r) => !r.sourceRow && r.metas.length > 0)
    .slice(0, MAX_SNAPSHOT_ROWS)
    .map((r) => ({
      key: r.key,
      type: r.type,
      name: r.name,
      metas: r.metas.slice(0, MAX_METAS_PER_ROW).map((m) => trimMeta(m, false)),
      noDedup: r.noDedup,
    }));
  const serializedHero = hero.slice(0, MAX_HERO_METAS).map((m) => trimMeta(m, true));
  if (serializedRows.length === 0 && serializedHero.length === 0) return;
  const payload: HomeSnapshotPayload = {
    v: SNAPSHOT_VERSION,
    scope: homeSnapshotScope(settings, uiLang),
    savedAt: Date.now(),
    rows: serializedRows,
    hero: serializedHero,
  };
  try {
    localStorage.setItem(HOME_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors when caching SWR snapshot */
  }
}

export function clearHomeSnapshot(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(HOME_SNAPSHOT_KEY);
  } catch {
    /* ignore storage cleanup error */
  }
}

export function readLibrarySnapshot(userId: string | undefined): LibraryItem[] | null {
  if (!userId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIBRARY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibrarySnapshotPayload;
    if (
      !parsed ||
      parsed.v !== SNAPSHOT_VERSION ||
      parsed.userId !== userId ||
      !Number.isFinite(parsed.savedAt) ||
      Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeLibrarySnapshot(userId: string | undefined, items: LibraryItem[]): void {
  if (!userId || typeof localStorage === "undefined") return;
  const sorted = [...items]
    .sort((a, b) => Date.parse(b._mtime ?? "") - Date.parse(a._mtime ?? ""))
    .slice(0, MAX_LIBRARY_ITEMS);
  const payload: LibrarySnapshotPayload = {
    v: SNAPSHOT_VERSION,
    userId,
    savedAt: Date.now(),
    items: sorted,
  };
  try {
    localStorage.setItem(LIBRARY_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors when caching library SWR snapshot */
  }
}

export function clearLibrarySnapshot(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LIBRARY_SNAPSHOT_KEY);
  } catch {
    /* ignore storage cleanup error */
  }
}
