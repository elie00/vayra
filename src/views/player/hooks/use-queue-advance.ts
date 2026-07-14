import { useEffect, useRef, type RefObject } from "react";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";
import { queueBeginNext, queueRejectStart, type QueueItem } from "@/lib/queue";
import { resolveLumaPlaybackTarget, type LumaAuthority } from "@/lib/luma";

const STUB_MAX_SEC = 150;

export function useQueueAdvance(params: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  queue: QueueItem[];
  isLive: boolean;
  startedNearEndRef: RefObject<boolean>;
  authority: LumaAuthority;
  autoAdvance: boolean;
  suspended: boolean;
  openPicker: (
    meta: Meta,
    episode?: PlayEpisode,
    opts?: { autoPlay?: boolean; attempt?: number; intent?: "play" | "download"; resume?: boolean },
  ) => void;
  openPlayer: (src: PlayerSrc) => void;
}) {
  const { src, snap, queue, isLive, startedNearEndRef, authority, autoAdvance, suspended, openPicker, openPlayer } = params;
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    firedForRef.current = null;
  }, [src.url]);

  useEffect(() => {
    if (isLive) return;
    if (snap.durationSec <= 0) return;
    if (snap.durationSec < STUB_MAX_SEC) return;
    if (startedNearEndRef.current) return;
    const pos = getPlaybackPosition();
    const naturalEnd = snap.status === "ended";
    const errorAtEnd = snap.errorCode != null && pos >= snap.durationSec - 2;
    const reachedEnd = snap.status !== "playing" && pos >= snap.durationSec - 1;
    if (!naturalEnd && !errorAtEnd && !reachedEnd) return;
    if (suspended) return;
    if (firedForRef.current === src.url) return;

    if (queue.length > 0 && authority === "solo" && autoAdvance) {
      firedForRef.current = src.url;
      const next = queueBeginNext(authority);
      if (next.ok) {
        const resolved = resolveLumaPlaybackTarget(next.value);
        if (!resolved.ok) {
          queueRejectStart(resolved.message);
          return;
        }
        if (resolved.target.kind === "player") openPlayer(resolved.target.src);
        else openPicker(resolved.target.meta, resolved.target.episode, { autoPlay: true, resume: true });
      }
      return;
    }
  }, [snap.status, snap.errorCode, snap.durationSec, src.url, isLive, queue, startedNearEndRef, authority, autoAdvance, suspended, openPicker, openPlayer]);
}
