import { invoke } from "@tauri-apps/api/core";
import type { LumaResumeEntry } from "@/lib/luma/types";
import { episodeFromVideoId, type LibraryItem } from "@/lib/stremio";
import type { UnifiedResume } from "@/lib/unified-resumes";

// VAYRA Connect carries the Mac's Continue Watching to paired phones, so the
// phone picks up where the Mac left off. The Rust server seals it in transit.

/** One place the Mac left off, as VAYRA Connect carries it. */
export type ConnectResume = {
  metaId: string;
  mediaType: "movie" | "series";
  season?: number;
  episode?: number;
  videoId?: string;
  title: string;
  episodeTitle?: string;
  artwork?: string;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
};

/** The Mac's resume points, LUMA and Stremio together; files only this Mac has stay behind. */
export function connectResumes(resumes: UnifiedResume[]): ConnectResume[] {
  return resumes.flatMap((resume) => {
    const carried = resume.kind === "local" ? fromLuma(resume.entry) : fromLibrary(resume.item);
    return carried ? [carried] : [];
  });
}

function fromLuma(entry: LumaResumeEntry): ConnectResume | null {
  if (entry.ref.kind !== "catalog") return null;
  const episode = entry.ref.episode;
  const { title, episodeTitle, artwork } = entry.presentation;
  return {
    metaId: entry.ref.metaId,
    mediaType: entry.ref.mediaType,
    ...(episode
      ? { season: episode.season, episode: episode.episode, ...(episode.canonicalVideoId ? { videoId: episode.canonicalVideoId } : {}) }
      : {}),
    title,
    ...(episodeTitle ? { episodeTitle } : {}),
    ...(artwork ? { artwork } : {}),
    positionMs: entry.positionMs,
    durationMs: entry.durationMs,
    updatedAt: entry.updatedAt,
  };
}

function fromLibrary(item: LibraryItem): ConnectResume | null {
  const state = item.state;
  if (!state || item.local || item._id.startsWith("local:") || !(state.duration > 0)) return null;
  const series = item.type !== "movie";
  const videoId = series ? state.video_id : undefined;
  // kitsu:ID:EPISODE has no season: it would read as season ID.
  const threePartAnime = /^(kitsu|mal|anilist|anidb):/.test(item._id) && (videoId ?? "").split(":").length === 3;
  const episode = !series
    ? null
    : state.season && state.episode
      ? { season: state.season, episode: state.episode }
      : threePartAnime
        ? null
        : episodeFromVideoId(videoId);
  return {
    metaId: item._id,
    mediaType: series ? "series" : "movie",
    ...(episode ? { season: episode.season, episode: episode.episode } : {}),
    ...(videoId ? { videoId } : {}),
    title: item.name,
    ...(item.poster ? { artwork: item.poster } : {}),
    positionMs: state.timeOffset,
    durationMs: state.duration,
    updatedAt: Date.parse(state.lastWatched ?? item._mtime) || 0,
  };
}

/** The Mac's resume points as entries this phone's LUMA keeps. */
export function lumaResumesFromMac(resumes: ConnectResume[]): Omit<LumaResumeEntry, "id">[] {
  return resumes.map((resume) => ({
    ref: {
      kind: "catalog",
      metaId: resume.metaId,
      mediaType: resume.mediaType,
      ...(resume.season != null && resume.episode != null
        ? { episode: { season: resume.season, episode: resume.episode, ...(resume.videoId ? { canonicalVideoId: resume.videoId } : {}) } }
        : {}),
    },
    presentation: {
      title: resume.title,
      ...(resume.episodeTitle ? { episodeTitle: resume.episodeTitle } : {}),
      ...(resume.artwork ? { artwork: resume.artwork } : {}),
    },
    positionMs: resume.positionMs,
    durationMs: resume.durationMs,
    updatedAt: resume.updatedAt,
  }));
}

/** Hands the Mac's resume points to paired phones. */
export const publishHistory = (history: ConnectResume[]) => invoke("connect_publish_history", { history });
