// The fastest the local engine downloaded lately: a ceiling on what this network
// gives torrents, unlike one swarm's pace. Read by the stream score, so a 4K file
// the engine could never feed in time does not come first; see scoring-stream.ts.

const STORAGE_KEY = "vayra.p2p-throughput.v1";
/** A day: a laptop moves between networks; what one gave says little of the next. */
const TTL_MS = 24 * 60 * 60 * 1000;

type Best = { bytesPerSec: number; at: number };

function load(): Best | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && typeof (parsed as Best).bytesPerSec === "number" ? (parsed as Best) : null;
  } catch {
    return null;
  }
}

/** Remember an engine download speed, keeping the best seen within the day. */
export function noteP2pThroughput(bytesPerSec: number, now = Date.now()): void {
  if (!(bytesPerSec > 0)) return;
  const best = load();
  if (best && now - best.at <= TTL_MS && best.bytesPerSec >= bytesPerSec) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bytesPerSec, at: now }));
  } catch (e) {
    console.warn("[p2p-throughput] could not save", e);
  }
}

/** The best engine speed of the last day in Mbps, or undefined when none is known. */
export function readP2pBandwidthMbps(now = Date.now()): number | undefined {
  const best = load();
  if (!best || now - best.at > TTL_MS) return undefined;
  return (best.bytesPerSec * 8) / 1_000_000;
}
