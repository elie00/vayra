import { useEffect, useRef } from "react";
import { useSimkl } from "./provider";
import { simklScrobble } from "./scrobble";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import type { PlayerSrc } from "@/lib/view";

type Snap = {
  status: string;
  positionSec: number;
  durationSec: number;
};

const STUB_MAX_SEC = 150;

export function useSimklScrobble({ src, snap }: { src: PlayerSrc; snap: Snap }): void {
  const { isConnected } = useSimkl();
  const { settings } = useSettings();
  const pauseOnPauseRef = useRef(settings.pauseListStatusOnPause);
  pauseOnPauseRef.current = settings.pauseListStatusOnPause;
  const metaId = src.meta.id;
  const key = `${metaId}|${src.episode?.season ?? ""}|${src.episode?.episode ?? ""}`;

  const sentRef = useRef<{ key: string; action: "start" | "pause" | "stop" } | null>(null);
  const latestRef = useRef<{ metaId: string; episode: PlayerSrc["episode"]; progress: number }>({
    metaId,
    episode: src.episode,
    progress: 0,
  });

  useEffect(() => {
    if (sentRef.current && sentRef.current.key !== key) sentRef.current = null;
  }, [key]);

  useEffect(() => {
    if (!isConnected || snap.durationSec <= 0) return;
    if (snap.durationSec < STUB_MAX_SEC) return;
    const pos = Math.max(snap.positionSec || 0, getPlaybackPosition());
    const progress = Math.min(100, (pos / snap.durationSec) * 100);
    latestRef.current = { metaId, episode: src.episode, progress };

    let want: "start" | "pause" | "stop" | null = null;
    if (snap.status === "ended") want = "stop";
    else if (snap.status === "playing") want = "start";
    else if (snap.status === "paused" && pauseOnPauseRef.current) want = "pause";
    if (!want) return;

    const last = sentRef.current;
    if (last && last.key === key) {
      if (last.action === want) return;
      if (last.action === "stop") return;
    }
    sentRef.current = { key, action: want };
    void simklScrobble(want, metaId, src.episode, progress);
  }, [isConnected, key, metaId, src.episode, snap.status, snap.positionSec, snap.durationSec]);

  useEffect(() => {
    return () => {
      const last = sentRef.current;
      const cur = latestRef.current;
      if (last && last.action !== "stop") {
        void simklScrobble("stop", cur.metaId, cur.episode, cur.progress);
      }
    };
  }, []);
}
