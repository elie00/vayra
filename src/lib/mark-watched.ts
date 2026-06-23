import type { Meta } from "@/lib/cinemeta";
import { savePlayback } from "@/lib/playback-history";
import { pushWatched } from "@/lib/trakt/history";
import { addToHistory as simklAddToHistory } from "@/lib/simkl/history";

export async function markMovieWatched(
  meta: Meta,
  imdbId?: string | null,
  tmdbId?: string | number | null,
): Promise<void> {
  savePlayback(meta.id, { title: meta.name, parsedTitle: meta.name });
  const imdb = imdbId ?? (meta.id.startsWith("tt") ? meta.id : undefined);
  const tmdb = typeof tmdbId === "string" ? Number(tmdbId) || undefined : tmdbId ?? undefined;
  if (!imdb && !tmdb) return;
  const ids = { ...(imdb ? { imdb } : {}), ...(tmdb ? { tmdb } : {}) };
  await Promise.allSettled([
    pushWatched({ kind: "movie", ids }),
    simklAddToHistory({ kind: "movie", ids }),
  ]);
}
