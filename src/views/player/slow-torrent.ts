/** Seconds of data flowing before a torrent's pace is judged. */
export const SLOW_TORRENT_GRACE_MS = 20_000;
/**
 * How long a torrent may bring nothing at all. Peers often hold data back for the
 * first tens of seconds (BitTorrent unchokes in 10–30 s rounds): judged at 20 s, a
 * torrent about to bring 2.9 MiB/s was dropped.
 */
export const NO_DATA_MS = 45_000;
/** A torrent bringing less than this share of what the file needs cannot catch up. */
const MIN_SHARE_OF_NEED = 0.5;
/** Running time to assume when the title has none. */
const TYPICAL_MINUTES = { movie: 110, series: 45 } as const;

/**
 * Whether a torrent that has shown no picture yet is too slow to ever play its file:
 * nothing at all for 45 s, or, 20 s after its first byte, far less on average than
 * the file's size spread over its running time. One crawling at 50 KiB/s used to
 * count as "progressing", and the player waited for it for minutes.
 */
export function torrentTooSlow(p: {
  fileBytes: number | null;
  runtimeMin: number | undefined;
  type: "movie" | "series";
  /** Since the stream started. */
  ageMs: number;
  /** Since the first byte came, or null while none has. */
  flowingMs: number | null;
  bytesSinceFlow: number;
}): boolean {
  if (p.flowingMs == null) return p.ageMs >= NO_DATA_MS;
  if (p.flowingMs < SLOW_TORRENT_GRACE_MS || !p.fileBytes) return false;
  const seconds = (p.runtimeMin ?? TYPICAL_MINUTES[p.type]) * 60;
  const needPerSec = p.fileBytes / seconds;
  const gotPerSec = p.bytesSinceFlow / (p.flowingMs / 1000);
  return gotPerSec < needPerSec * MIN_SHARE_OF_NEED;
}
