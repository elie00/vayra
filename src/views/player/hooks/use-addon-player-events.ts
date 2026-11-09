import { useEffect, useRef } from "react";
import { sendPlayerEvent, type PlayerEventAction } from "@/lib/addon-events";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { cloudWriteId } from "@/lib/stremio";
import type { PlayerSrc } from "@/lib/view";
import { videoIdFor } from "./use-stremio-sync";

/**
 * Tells addons with the `player` resource when playback starts, pauses and
 * stops, like Stremio. Only catalogue ids are sent; casts are left out since
 * the local player sits paused while the TV plays.
 */
export function useAddonPlayerEvents(params: {
  src: PlayerSrc;
  snap: Pick<PlayerSnapshot, "status" | "durationSec">;
  resolvedImdbId: string | null;
  resolvedImdbVerified: boolean;
  castActiveRef?: { current: boolean };
}): void {
  const { src, snap, resolvedImdbId, resolvedImdbVerified, castActiveRef } = params;
  const videoId = videoIdFor(src, cloudWriteId(src.meta.id, resolvedImdbId, resolvedImdbVerified));
  const type = src.meta.type === "series" || src.episode ? "series" : "movie";
  const lastRef = useRef<PlayerEventAction | "ended" | null>(null);
  const durationRef = useRef(snap.durationSec);
  durationRef.current = snap.durationSec;

  // Leaving the video (closing the player or moving to another episode) stops it.
  useEffect(() => {
    if (!videoId) return;
    lastRef.current = null;
    return () => {
      if (lastRef.current === "start" || lastRef.current === "pause") {
        void sendPlayerEvent(type, videoId, "stop", getPlaybackPosition(), durationRef.current);
      }
      lastRef.current = null;
    };
  }, [type, videoId]);

  useEffect(() => {
    if (!videoId || castActiveRef?.current) return;
    if (snap.status === "ended") {
      lastRef.current = "ended";
      return;
    }
    if (snap.durationSec <= 0) return;
    const next = snap.status === "playing" ? "start" : snap.status === "paused" ? "pause" : null;
    if (!next || next === lastRef.current) return;
    lastRef.current = next;
    void sendPlayerEvent(type, videoId, next, getPlaybackPosition(), snap.durationSec);
  }, [type, videoId, snap.status, snap.durationSec, castActiveRef]);
}
