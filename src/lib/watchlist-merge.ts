import type { Meta } from "./cinemeta";
import { libraryMetaType, type LibraryItem } from "./stremio";
import type { LocalEntry } from "./watchlist";
import type { TraktItem } from "./trakt/types";
import { traktItemToMeta } from "./trakt/to-meta";

export type WatchlistMerged = { key: string; meta: Meta; date: number | null; stremioId?: string };

function parseTs(value: string | undefined | null): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
}

export function filterLibrary(items: LibraryItem[], bookmarkedOnly: boolean): LibraryItem[] {
  return items.filter((i) => {
    if (i.removed) return false;
    if (i.state?.flaggedWatched === 1) return false;
    if ((i.state?.timeOffset ?? 0) > 0) return false;
    if (bookmarkedOnly && i.temp) return false;
    return true;
  });
}

export function mergeWatchlist(
  localEntries: LocalEntry[],
  stremio: LibraryItem[],
  trakt: TraktItem[],
): WatchlistMerged[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  const byKey = new Map<string, WatchlistMerged>();
  const setOrUpgrade = (key: string, entry: WatchlistMerged) => {
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      return;
    }
    const existingTt = existing.meta.id.startsWith("tt");
    const incomingTt = entry.meta.id.startsWith("tt");
    if (incomingTt && !existingTt) {
      byKey.set(key, entry);
    }
  };
  for (const item of stremio) {
    const meta: Meta = {
      id: item._id,
      type: libraryMetaType(item.type),
      name: item.name,
      poster: item.poster,
      background: item.background,
    };
    const dedupKey = `${item.type}:${norm(item.name ?? "")}`;
    setOrUpgrade(dedupKey, { key: item._id, meta, date: parseTs(item._mtime), stremioId: item._id });
  }
  for (const t of trakt) {
    const m = traktItemToMeta(t);
    if (!m) continue;
    const dedupKey = `${m.type}:${norm(m.name ?? "")}`;
    if (byKey.has(dedupKey)) continue;
    byKey.set(dedupKey, { key: m.id, meta: m, date: parseTs(t.contextDate) });
  }
  for (const e of localEntries) {
    let dupById = false;
    for (const v of byKey.values()) {
      if (v.meta.id === e.id) { dupById = true; break; }
    }
    if (dupById) continue;
    const nameKey = e.name ? `${e.type}:${norm(e.name)}` : null;
    if (nameKey && byKey.has(nameKey)) continue;
    byKey.set(nameKey ?? `local:${e.id}`, {
      key: e.id,
      meta: { id: e.id, type: e.type, name: e.name || e.id, poster: e.poster },
      date: e.addedAt || null,
    });
  }
  return Array.from(byKey.values());
}

