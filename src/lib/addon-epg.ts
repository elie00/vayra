import type { Meta } from "@/lib/cinemeta";

/**
 * Stremio's native EPG (stremio-addon-sdk docs/epg.md): a `tv` meta carries its
 * programme guide in `videos`, each programme with `startTime` and `endTime`.
 * Playback identity stays the channel, never a programme.
 */
export type Programme = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  overview?: string;
  thumbnail?: string;
};

type MetaVideo = NonNullable<Meta["videos"]>[number];

function toProgramme(video: MetaVideo): Programme | null {
  if (!video.startTime || !video.endTime) return null;
  const startMs = Date.parse(video.startTime);
  const endMs = Date.parse(video.endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return {
    id: video.id ?? `${video.startTime}`,
    title: video.title ?? video.name ?? "",
    startMs,
    endMs,
    overview: video.overview ?? video.description,
    thumbnail: video.thumbnail,
  };
}

export function programmesOf(videos: Meta["videos"]): Programme[] {
  return (videos ?? [])
    .map(toProgramme)
    .filter((p): p is Programme => p != null)
    .sort((a, b) => a.startMs - b.startMs);
}

/** A channel whose `videos` are a programme guide rather than episodes to play. */
export function hasProgrammeGuide(meta: Pick<Meta, "videos" | "behaviorHints">): boolean {
  const videos = meta.videos ?? [];
  const programmes = programmesOf(videos).length;
  if (programmes === 0) return false;
  return meta.behaviorHints?.hasScheduledVideos === true || programmes === videos.length;
}

/** What is on at `nowMs` and the next few programmes. A gap stays a gap. */
export function scheduleWindow(
  programmes: Programme[],
  nowMs: number,
  limit: number,
): { current: Programme | null; upcoming: Programme[] } {
  const current = programmes.find((p) => p.startMs <= nowMs && nowMs < p.endMs) ?? null;
  const upcoming = programmes.filter((p) => p.startMs > nowMs).slice(0, limit);
  return { current, upcoming };
}
