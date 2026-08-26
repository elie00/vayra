import type { EpisodeHint } from "@/lib/streams/episode-file";

/**
 * Whether falling back to the largest file is safe once episode matching has
 * failed.
 *
 * For a movie, or a torrent holding a single video, the largest file is the
 * obvious answer. For a season pack it is a guess at which episode the viewer
 * gets — and a wrong guess plays the wrong episode with nothing to say so.
 * Better to report that this source cannot deliver the episode, and let the
 * picker offer another.
 */
export function canFallBackToLargest(
  hint: EpisodeHint | undefined,
  poolSize: number,
): boolean {
  if (poolSize <= 1) return true;
  return !hint || hint.episode == null;
}
