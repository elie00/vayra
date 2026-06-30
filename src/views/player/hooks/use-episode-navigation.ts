import { useCallback, useEffect, useState } from "react";
import type { PlayInvite } from "@/lib/together/protocol";
import type { PlayerSrc, PlayEpisode } from "@/lib/view";
import type { Meta } from "@/lib/cinemeta";
import type { Settings } from "@/lib/settings";
import type { DebridStore } from "@/lib/debrid/types";
import { fetchAdjacentEpisodes } from "@/lib/series-episodes";

type OpenPicker = (
  meta: Meta,
  episode?: PlayEpisode,
  opts?: { autoPlay?: boolean; attempt?: number },
) => void;

export function useEpisodeNavigation(params: {
  src: PlayerSrc;
  settings: Settings;
  debrids: DebridStore[];
  authKey: string | null;
  inRoom: boolean;
  isHost: boolean;
  sendInvite: (invite: PlayInvite) => void;
  claimHost: (fresh: boolean) => void;
  replacePlayerSrc: (src: PlayerSrc) => void;
  openPicker: OpenPicker;
}) {
  const { src, settings, inRoom, isHost, openPicker } = params;

  const [adjacent, setAdjacent] = useState<{ prev: PlayEpisode | null; next: PlayEpisode | null }>({
    prev: null,
    next: null,
  });

  useEffect(() => {
    if (src.meta.type !== "series" || !src.episode) {
      setAdjacent({ prev: null, next: null });
      return;
    }
    let cancelled = false;
    const cur = { season: src.episode.season, episode: src.episode.episode };
    fetchAdjacentEpisodes(src.meta, cur, {
      tmdbKey: settings.tmdbKey,
      kitsuStreamId: src.episode.kitsuStreamId,
    }).then((r) => {
      if (!cancelled) setAdjacent(r);
    });
    return () => {
      cancelled = true;
    };
  }, [src.meta.id, src.meta.type, src.episode, settings.tmdbKey]);

  const goToEpisode = useCallback(
    (ep: PlayEpisode | null) => {
      if (!ep) return;
      if (inRoom && !isHost) return;
      openPicker(src.meta, ep, { autoPlay: true });
    },
    [openPicker, src.meta, inRoom, isHost],
  );

  return { adjacent, swappingEp: false, goToEpisode };
}
