/**
 * Anime Franchise Grouping — Hybrid Approach
 *
 * Groups anime items by franchise so that multiple seasons of the same series
 * (e.g., "Gintama", "Gintama.", "Gintama°") appear as a single card in the UI.
 *
 * Methods (in priority order):
 * 1. Title normalization — strip season indicators and compare base titles
 * 2. SIMKL relations API — fetch related anime from /anime/{id} endpoint
 * 3. Safety threshold — if confidence is low, don't group
 */

import type { SimklCacheItem } from "./activities";
import { simklRequest } from "./client";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface AnimeFranchise {
  /** Normalized franchise key (e.g., "gintama") */
  key: string;
  /** Display name for the franchise (uses the first/oldest season's title) */
  name: string;
  /** All SIMKL IDs that belong to this franchise */
  simklIds: number[];
  /** All items in the franchise */
  items: SimklCacheItem[];
  /** Best available poster (from any item in the group) */
  bestTitle: string;
  /** Year range: earliest start → latest end */
  yearStart: number | null;
  yearEnd: number | null;
  /** Average community rating across seasons (computed by caller) */
  averageRating: number | null;
}

/* ─── Title Normalization ─────────────────────────────────────────────────── */

/**
 * Season indicator patterns to strip from titles for grouping.
 * Conservative — only strips clear season suffixes to avoid false positives.
 */
const SEASON_PATTERNS: RegExp[] = [
  // Trailing punctuation: ".", "°", "'", ":", "!", "?", "..."
  /[.\u00b0'`:!?]+$/,
  // "Season N" or "S N" at the end
  /\s+season\s*\d+$/i,
  /\s+s\d+$/i,
  // "Nth Season" at the end
  /\s+\d+(st|nd|rd|th)\s+season$/i,
  // "Part N" or "Cour N" at the end
  /\s+part\s*\d+$/i,
  /\s+cour\s*\d+$/i,
  // "II", "III", "IV" Roman numerals at the end
  /\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/i,
  // "2nd", "3rd" etc. at the end
  /\s+\d+(st|nd|rd|th)$/i,
  // Year suffix at the end (e.g., "Fairy Tail 2014" → "Fairy Tail")
  /\s+\d{4}$/,
  // "Final Season" at the end
  /\s+final\s+season$/i,
  // "The Final" at the end
  /\s+the\s+final$/i,
  // "Final" at the end (e.g., "Gintama Final" → "Gintama")
  // Note: This could group movies with series, but the title normalization
  // is only used for anime grouping in the library, not for movie grouping
  /\s+final$/i,
  // Common sequel terms
  /\s+shippuden$/i,
  /\s+gaiden$/i,
  /\s+side\s+story$/i,
  // "R" / "R2" at the end (e.g., "Code Geass R2")
  /\s+r\d?$/i,
  // "TV" at the end (e.g., "Gintama TV")
  /\s+tv$/i,
];

/**
 * Normalize a title for franchise grouping.
 * Strips season indicators and normalizes whitespace/punctuation.
 */
export function normalizeAnimeTitle(title: string): string {
  let normalized = title.trim().toLowerCase();

  // Remove common prefixes/suffixes that don't affect franchise identity
  normalized = normalized
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  // Apply season pattern stripping iteratively (e.g., "Gintama. Season 2" → "Gintama")
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of SEASON_PATTERNS) {
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, "").trim();
        changed = true;
      }
    }
  }

  // Strip everything after a colon (e.g., "Attack on Titan: Final Season" → "Attack on Titan")
  // This is done AFTER other patterns to handle cases like "Gintama.: Shinyaku Benkyou Arc"
  // where the trailing "." is stripped first, then the colon content is stripped
  if (normalized.includes(":")) {
    normalized = normalized.split(":")[0].trim();
  }

  // Remove all non-alphanumeric characters for comparison
  normalized = normalized.replace(/[^a-z0-9]/g, "");

  return normalized;
}

/* ─── SIMKL Relations API ─────────────────────────────────────────────────── */

interface SimklRelation {
  title?: string;
  en_title?: string | null;
  year?: number;
  anime_type?: string;
  relation_type?: string;
  is_direct?: boolean;
  ids?: {
    simkl_id?: number;
  };
}

interface SimklAnimeDetail {
  relations?: SimklRelation[];
}

/** In-memory cache: SIMKL ID → Set of related SIMKL IDs */
const relationsCache = new Map<number, Set<number>>();
/** In-flight requests */
const relationsInFlight = new Map<number, Promise<Set<number>>>();

/**
 * Fetch related anime SIMKL IDs from the /anime/{id} endpoint.
 * Results are cached in-memory.
 */
async function fetchRelations(simklId: number): Promise<Set<number>> {
  if (relationsCache.has(simklId)) {
    return relationsCache.get(simklId)!;
  }
  if (relationsInFlight.has(simklId)) {
    return relationsInFlight.get(simklId)!;
  }

  const promise = (async () => {
    try {
      const detail = await simklRequest<SimklAnimeDetail>(
        `/anime/${simklId}`,
        { method: "GET", authed: false },
      );
      const related = new Set<number>();
      if (detail.relations && Array.isArray(detail.relations)) {
        for (const rel of detail.relations) {
          if (rel.ids?.simkl_id && rel.is_direct !== false) {
            related.add(rel.ids.simkl_id);
          }
        }
      }
      relationsCache.set(simklId, related);
      return related;
    } catch {
      relationsCache.set(simklId, new Set());
      return new Set<number>();
    } finally {
      relationsInFlight.delete(simklId);
    }
  })();

  relationsInFlight.set(simklId, promise);
  return promise;
}

/* ─── Franchise Grouping ─────────────────────────────────────────────────── */

/**
 * Group anime cache items by franchise using title normalization.
 * This is the fast, synchronous first pass — no API calls.
 *
 * @param items All anime items from the cache
 * @param useRelationsApi Kept for API compatibility but ignored (use enhanceGroupsWithRelations)
 */
export function groupAnimeByFranchise(
  items: SimklCacheItem[],
  useRelationsApi = false,
): AnimeFranchise[] {
  void useRelationsApi; // Relations enhancement is now async — use enhanceGroupsWithRelations()

  // Step 1: Group by normalized title
  const titleGroups = new Map<string, SimklCacheItem[]>();

  for (const item of items) {
    const normalizedTitle = normalizeAnimeTitle(item.title);
    if (!normalizedTitle) continue;

    const group = titleGroups.get(normalizedTitle) ?? [];
    group.push(item);
    titleGroups.set(normalizedTitle, group);
  }

  // Build franchise objects from title groups
  const franchises: AnimeFranchise[] = [];

  for (const [normalizedTitle, groupItems] of titleGroups) {
    // Sort items by year (ascending) so the first item is the earliest
    groupItems.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

    const years = groupItems.map((i) => i.year).filter((y): y is number => y != null);
    const yearStart = years.length > 0 ? Math.min(...years) : null;
    const yearEnd = years.length > 0 ? Math.max(...years) : null;

    // Use the first (oldest) item's title as the franchise display name
    // But prefer the shortest title (likely the base franchise name)
    const titles = groupItems.map((i) => i.title);
    const bestTitle = titles.reduce((best, current) =>
      current.length < best.length ? current : best,
    );

    franchises.push({
      key: normalizedTitle,
      name: bestTitle,
      simklIds: groupItems.map((i) => i.simklId),
      items: groupItems,
      bestTitle,
      yearStart,
      yearEnd,
      averageRating: null, // Computed by caller if needed
    });
  }

  // Sort franchises by name
  franchises.sort((a, b) => a.name.localeCompare(b.name));

  return franchises;
}

/**
 * Enhance franchise grouping by using the SIMKL relations API.
 *
 * After title-based grouping, this function:
 * 1. Identifies singleton groups (franchises with only 1 item)
 * 2. Fetches relations for each singleton via /anime/{id}
 * 3. If a relation links to an item in another group, merges the two groups
 *
 * This catches cases like:
 * - "Gintama" → "Gintama.: Shinyaku Benkyou Arc" (different normalized titles but related)
 * - "Attack on Titan" → "Shingeki no Kyojin" (same series, different title)
 *
 * @param franchises The title-based franchise groups
 * @param maxApiCalls Limit to avoid excessive API requests (default: 50)
 * @returns Merged franchise groups
 */
export async function enhanceGroupsWithRelations(
  franchises: AnimeFranchise[],
  maxApiCalls = 50,
): Promise<AnimeFranchise[]> {
  if (franchises.length <= 1) return franchises;

  // Build a map: simklId → franchise index
  const simklIdToFranchise = new Map<number, number>();
  for (let i = 0; i < franchises.length; i++) {
    for (const simklId of franchises[i].simklIds) {
      simklIdToFranchise.set(simklId, i);
    }
  }

  // Identify singletons (franchises with only 1 item) — these are candidates for merging
  const singletons = franchises.filter((f) => f.items.length === 1);
  const singletonsToCheck = singletons.slice(0, maxApiCalls);

  // Fetch relations for each singleton in parallel (limited concurrency)
  const BATCH_SIZE = 10;
  const mergePairs: Array<[number, number]> = []; // [franchiseIndexA, franchiseIndexB]

  for (let i = 0; i < singletonsToCheck.length; i += BATCH_SIZE) {
    const batch = singletonsToCheck.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (franchise) => {
        const simklId = franchise.simklIds[0];
        const relations = await fetchRelations(simklId);
        return { franchise, relations };
      }),
    );

    for (const { franchise, relations } of results) {
      const currentIdx = simklIdToFranchise.get(franchise.simklIds[0])!;
      for (const relatedId of relations) {
        const targetIdx = simklIdToFranchise.get(relatedId);
        if (targetIdx != null && targetIdx !== currentIdx) {
          mergePairs.push([currentIdx, targetIdx]);
        }
      }
    }
  }

  if (mergePairs.length === 0) return franchises;

  // Union-Find to merge groups
  const parent = franchises.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const [a, b] of mergePairs) {
    union(a, b);
  }

  // Build merged franchises
  const mergedGroups = new Map<number, number[]>();
  for (let i = 0; i < franchises.length; i++) {
    const root = find(i);
    const group = mergedGroups.get(root) ?? [];
    group.push(i);
    mergedGroups.set(root, group);
  }

  const result: AnimeFranchise[] = [];
  for (const indices of mergedGroups.values()) {
    if (indices.length === 1) {
      result.push(franchises[indices[0]]);
      continue;
    }

    // Merge all items from all franchises in this group
    const allItems: SimklCacheItem[] = [];
    for (const idx of indices) {
      allItems.push(...franchises[idx].items);
    }
    allItems.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

    const years = allItems.map((i) => i.year).filter((y): y is number => y != null);
    const yearStart = years.length > 0 ? Math.min(...years) : null;
    const yearEnd = years.length > 0 ? Math.max(...years) : null;

    const titles = allItems.map((i) => i.title);
    const bestTitle = titles.reduce((best, current) =>
      current.length < best.length ? current : best,
    );

    // Use the first franchise's key as the merged key
    const firstKey = franchises[indices[0]].key;

    result.push({
      key: firstKey,
      name: bestTitle,
      simklIds: allItems.map((i) => i.simklId),
      items: allItems,
      bestTitle,
      yearStart,
      yearEnd,
      averageRating: null,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/**
 * Compute the average rating across all seasons in a franchise.
 * @param franchise The franchise to compute the average for
 * @param getRating Function to get the community rating for a SIMKL ID
 * @returns Average rating or null if no ratings available
 */
export function computeFranchiseAverageRating(
  franchise: AnimeFranchise,
  getRating: (simklId: number) => number | null,
): number | null {
  const ratings = franchise.simklIds
    .map((id) => getRating(id))
    .filter((r): r is number => r != null && r > 0);

  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/**
 * Format a year range for display.
 * e.g., "2005-2021" or "2019" if start === end
 */
export function formatYearRange(start: number | null, end: number | null): string {
  if (start == null && end == null) return "";
  if (start === end) return start != null ? String(start) : "";
  if (start != null && end != null) return `${start}-${end}`;
  return start != null ? String(start) : String(end);
}

/**
 * Clear all cached relations data (e.g., on SIMKL disconnect).
 */
export function clearAnimeGroupingCache() {
  relationsCache.clear();
  relationsInFlight.clear();
}