import { registerCache } from "@/lib/memory-profiler";
import type { CacheMap, DebridResult, DebridStore } from "./types";

// TTL + inflight cache wrapping a provider's cacheCheck().
// Availability rarely flips within a few minutes, so the picker can be re-opened
// repeatedly without re-hitting the network. Mirrors the inflight pattern in
// lib/logo.ts and lib/hover-preview/synopsis-cache.ts.
const TTL_MS = 3 * 60_000;

type Entry = { at: number; data: CacheMap };

// Each wrapped store gets its own maps, so the provider slug + apiKey (both baked
// into the store closure) are inherently part of the cache identity.
let liveCaches = 0;
let liveInflight = 0;
registerCache("debrid:cacheCheck", () => liveCaches);
registerCache("debrid:cacheCheck:inflight", () => liveInflight);

function keyOf(hashes: string[]): string {
  return [...new Set(hashes.map((h) => h.toLowerCase()))].sort().join(",");
}

export function withCacheCheckCache(store: DebridStore): DebridStore {
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<DebridResult<CacheMap>>>();

  async function cacheCheck(
    hashes: string[],
    signal: AbortSignal,
  ): Promise<DebridResult<CacheMap>> {
    if (hashes.length === 0) return { ok: true, data: {} };
    const key = keyOf(hashes);

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, data: hit.data };

    const existing = inflight.get(key);
    if (existing) return existing;

    const p = store
      .cacheCheck(hashes, signal)
      .then((r) => {
        // Only cache successful lookups; failures should be retried next time.
        if (r.ok) {
          cache.set(key, { at: Date.now(), data: r.data });
          liveCaches = cache.size;
        }
        return r;
      })
      .finally(() => {
        inflight.delete(key);
        liveInflight = inflight.size;
      });
    inflight.set(key, p);
    liveInflight = inflight.size;
    return p;
  }

  return { ...store, cacheCheck };
}
