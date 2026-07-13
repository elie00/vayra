import { useEffect, useRef, type RefObject } from "react";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";
import { getSleepAtEnd, queueBeginNext, setSleepAtEnd, type QueueItem } from "@/lib/queue";
import type { LumaAuthority } from "@/lib/luma";

const STUB_MAX_SEC = 150;

export function useQueueAdvance(params: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  queue: QueueItem[];
  isLive: boolean;
  startedNearEndRef: RefObject<boolean>;
  authority: LumaAuthority;
  openPicker: (
    meta: Meta,
    episode?: PlayEpisode,
    opts?: { autoPlay?: boolean; attempt?: number; intent?: "play" | "download"; resume?: boolean },
  ) => void;
  exitPlayer: () => void;
}) {
  const { src, snap, queue, isLive, startedNearEndRef, authority, openPicker, exitPlayer } = params;
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
    if (firedForRef.current === src.url) return;

    if (queue.length > 0 && authority === "solo") {
      firedForRef.current = src.url;
      const next = queueBeginNext(authority);
      if (next.ok) openPicker(next.value.meta, next.value.episode, { autoPlay: true, resume: true });
      return;
    }
    if (getSleepAtEnd()) {
      firedForRef.current = src.url;
      setSleepAtEnd(false);
      exitPlayer();
    }
  }, [snap.status, snap.errorCode, snap.durationSec, src.url, isLive, queue, startedNearEndRef, authority, openPicker, exitPlayer]);
}
