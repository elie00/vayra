import type { Meta } from "@/lib/cinemeta";
import { findLocalEpisodeByIds, findLocalMovie, type LocalEntry } from "@/lib/local-library";
import { episodeLabel } from "@/lib/local-library/player-src";
import { openWatchLocalConfirm } from "@/lib/player/watch-local-confirm";

export type LocalPlaybackMode = "ask" | "local" | "stream";

// Parse a catalog meta id into a TMDB id / IMDb id for local matching.
function idsFromMeta(meta: Meta, extraImdb?: string | null): { tmdbId: number | null; imdbId: string | null } {
  let tmdbId: number | null = null;
  let imdbId: string | null = extraImdb ?? null;
  const id = meta.id;
  const m = id.match(/^tmdb:(?:movie|tv):(\d+)$/);
  if (m) tmdbId = parseInt(m[1], 10);
  else if (id.startsWith("tt")) imdbId = imdbId ?? id;
  return { tmdbId, imdbId };
}

// The local file that would satisfy playing this meta (optionally a specific
// episode), or null if there's nothing on disk for it.
export function resolveLocalPlay(
  meta: Meta,
  episode?: { season: number; episode: number } | null,
  extraImdb?: string | null,
): LocalEntry | null {
  const { tmdbId, imdbId } = idsFromMeta(meta, extraImdb);
  if (tmdbId == null && imdbId == null) return null;
  if (episode && episode.season != null && episode.episode != null) {
    return findLocalEpisodeByIds(episode.season, episode.episode, tmdbId, imdbId);
  }
  return findLocalMovie(tmdbId, imdbId);
}

// Decide between playing a local file and streaming, honoring the user's mode.
// - no local / mode "stream" → playStream()
// - autoplay, or mode "local"  → playLocal() (no prompt)
// - manual + mode "ask"        → prompt; the choice (optionally remembered) routes it
export function playLocalAware(opts: {
  meta: Meta;
  episode?: { season: number; episode: number } | null;
  extraImdb?: string | null;
  mode: LocalPlaybackMode;
  source: "manual" | "auto";
  playLocal: (entry: LocalEntry) => void;
  playStream: () => void;
  setMode: (mode: LocalPlaybackMode) => void;
}): void {
  const { meta, episode, extraImdb, mode, source, playLocal, playStream, setMode } = opts;
  const local = mode === "stream" ? null : resolveLocalPlay(meta, episode, extraImdb);
  if (!local) {
    playStream();
    return;
  }
  if (source === "auto" || mode === "local") {
    playLocal(local);
    return;
  }
  openWatchLocalConfirm({
    title: local.title || meta.name,
    subtitle: episodeLabel(local),
    onChoose: (choice, remember) => {
      if (remember) setMode(choice);
      if (choice === "local") playLocal(local);
      else playStream();
    },
  });
}
