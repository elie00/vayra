// Imperative store for the local-series episode-availability grid. Raised from a
// local library card (browse a series' local episodes) or from a series' detail
// Play button (pick a local episode, or fall back to streaming). Mirrors the
// watch-local-confirm store pattern.

import type { LocalEntry } from "@/lib/local-library";
import type { Meta } from "@/lib/cinemeta";

export type LocalEpisodesPayload = {
  title: string;
  tmdbId: number | null;
  imdbId: string | null;
  poster?: string | null;
  // The show's full season/episode structure (from TMDB/Cinemeta), so seasons and
  // episodes that aren't downloaded still render as empty cells in the grid. When
  // omitted, the modal fetches it from the imdb id.
  videos?: Meta["videos"];
  // When opened by pressing a specific episode, pre-select that season and
  // highlight the episode row so the user can play it in one click.
  initialSeason?: number | null;
  highlightEpisode?: number | null;
  onPlayLocal: (entry: LocalEntry) => void;
  // Present only from the detail Play entry point — offers a "Stream instead" path.
  onStream?: () => void;
};

type LocalEpisodesState = { open: boolean; payload: LocalEpisodesPayload | null };

let state: LocalEpisodesState = { open: false, payload: null };
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
}

export function openLocalEpisodes(payload: LocalEpisodesPayload): void {
  state = { open: true, payload };
  emit();
}

export function closeLocalEpisodes(): void {
  if (!state.open) return;
  state = { open: false, payload: null };
  emit();
}

export function getLocalEpisodes(): LocalEpisodesState {
  return state;
}

export function subscribeLocalEpisodes(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
