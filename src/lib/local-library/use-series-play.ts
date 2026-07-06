import { useCallback } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useView, type PlayEpisode } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { findLocalEpisodeByIds } from "@/lib/local-library";
import { localPlayerSrc } from "@/lib/local-library/player-src";
import { openLocalEpisodes } from "@/lib/player/local-episodes-modal";

type PlayOpts = { autoPlay?: boolean; resume?: boolean };

// Local-aware play for a single series episode pressed from the detail Episodes
// list (any layout). When the series has files on disk and the mode isn't
// "stream", it surfaces the availability grid (pre-selecting the pressed episode)
// so the user can watch locally or stream; otherwise it streams via the picker
// exactly as before. Mode "local" plays the exact local episode directly.
export function useLocalAwareSeriesPlay() {
  const { openPicker, openPlayer } = useView();
  const { settings } = useSettings();
  return useCallback(
    (args: {
      meta: Meta;
      episode: PlayEpisode;
      opts?: PlayOpts;
      imdbId?: string | null;
      videos?: Meta["videos"];
    }) => {
      const { meta, episode, opts, imdbId, videos } = args;
      const stream = () => openPicker(meta, episode, opts);
      if (settings.localPlaybackMode === "stream") {
        stream();
        return;
      }
      const m = meta.id.match(/^tmdb:tv:(\d+)$/);
      const tmdbId = m ? parseInt(m[1], 10) : null;
      const seriesImdb = imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);
      // Only the pressed episode matters: if it isn't on disk, stream it directly
      // (e.g. pressing an S04 episode when only S02/S03 are downloaded).
      const thisLocal = findLocalEpisodeByIds(episode.season, episode.episode, tmdbId, seriesImdb);
      if (!thisLocal) {
        stream();
        return;
      }
      // Mode "local" plays the local copy without asking.
      if (settings.localPlaybackMode === "local") {
        openPlayer(localPlayerSrc(thisLocal));
        return;
      }
      // Mode "ask": surface the availability grid, highlighting the pressed episode.
      openLocalEpisodes({
        title: meta.name,
        tmdbId,
        imdbId: seriesImdb,
        poster: meta.poster,
        videos,
        initialSeason: episode.season,
        highlightEpisode: episode.episode,
        onPlayLocal: (e) => openPlayer(localPlayerSrc(e)),
        onStream: stream,
      });
    },
    [openPicker, openPlayer, settings.localPlaybackMode],
  );
}
