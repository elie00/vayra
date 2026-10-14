// How many peers the local engine actually reached for a torrent, as opposed to the
// seeders an add-on announces: a torrent announcing 500 seeders that delivered none
// should not come first again. Read by the stream score; see scoring-stream.ts.

const STORAGE_KEY = "vayra.swarm-health.v1";
/** Swarms change: what the engine saw is trusted for three days. */
export const SWARM_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

type Entry = { peers: number; at: number };

function load(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

function save(entries: Record<string, Entry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("[swarm-health] could not save", e);
  }
}

/** Remember the peers the engine is connected to for a torrent, keeping the most seen lately. */
export function noteSwarmPeers(infoHash: string, peers: number, now = Date.now()): void {
  const key = infoHash.toLowerCase();
  const entries = load();
  const prev = entries[key];
  const fresh = prev && now - prev.at <= SWARM_TTL_MS ? prev : null;
  if (fresh && fresh.peers >= peers) return;
  entries[key] = { peers, at: now };
  const kept = Object.entries(entries)
    .filter(([, e]) => now - e.at <= SWARM_TTL_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_ENTRIES);
  save(Object.fromEntries(kept));
}

/** Peers reached per lower-case info hash, for torrents seen within the TTL. */
export function readSwarmPeers(now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [hash, e] of Object.entries(load())) {
    if (now - e.at <= SWARM_TTL_MS && typeof e.peers === "number") out[hash] = e.peers;
  }
  return out;
}
