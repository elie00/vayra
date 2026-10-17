/** Seconds a torrent gets before its pace is judged. */
export const SLOW_TORRENT_GRACE_MS = 20_000;
/** A torrent bringing less than this share of what the file needs cannot catch up. */
const MIN_SHARE_OF_NEED = 0.5;
/** Running time to assume when the title has none. */
const TYPICAL_MINUTES = { movie: 110, series: 45 } as const;

/**
 * Whether a torrent that has shown no picture yet is too slow to ever play its file:
 * it brought, on average since the stream started, far less than the file's size
 * spread over its running time. One crawling at 50 KiB/s used to count as
 * "progressing", and the player waited for it for minutes.
 */
export function torrentTooSlow(p: {
  fileBytes: number | null;
  runtimeMin: number | undefined;
  type: "movie" | "series";
  ageMs: number;
  bytesSinceStart: number;
}): boolean {
  if (p.ageMs < SLOW_TORRENT_GRACE_MS || !p.fileBytes) return false;
  const seconds = (p.runtimeMin ?? TYPICAL_MINUTES[p.type]) * 60;
  const needPerSec = p.fileBytes / seconds;
  const gotPerSec = p.bytesSinceStart / (p.ageMs / 1000);
  return gotPerSec < needPerSec * MIN_SHARE_OF_NEED;
}
