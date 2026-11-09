import { invoke } from "@tauri-apps/api/core";
import type { PlayerSnapshot } from "./bridge";

// macOS extrapolates the elapsed time from the rate, so the system only needs
// the state again when playback starts, stops, seeks or changes speed.
const DRIFT_SEC = 1.5;

type Send = (cmd: "now_playing_update" | "now_playing_clear", args?: Record<string, unknown>) => Promise<unknown>;
type Sent = { at: number; playing: boolean; position: number; duration: number; rate: number };

/** Publishes mpv playback to macOS Now Playing (Control Center, media keys). */
export function createNowPlaying(send: Send = invoke) {
  let title: string | null = null;
  let last: PlayerSnapshot | null = null;
  let sent: Sent | null = null;

  const push = (snap: PlayerSnapshot, now: number) => {
    if (!title) return;
    const playing = snap.status === "playing";
    sent = { at: now, playing, position: snap.positionSec, duration: snap.durationSec, rate: snap.rate };
    void send("now_playing_update", {
      info: { title, duration: snap.durationSec, position: snap.positionSec, rate: snap.rate, playing },
    }).catch(() => {});
  };

  const update = (snap: PlayerSnapshot, now: number) => {
    last = snap;
    if (!title || snap.status === "idle" || snap.status === "loading") return;
    const playing = snap.status === "playing";
    if (!sent || sent.playing !== playing || sent.rate !== snap.rate || sent.duration !== snap.durationSec) {
      push(snap, now);
      return;
    }
    const expected = sent.position + (playing ? ((now - sent.at) / 1000) * sent.rate : 0);
    if (Math.abs(snap.positionSec - expected) > DRIFT_SEC) push(snap, now);
  };

  return {
    setTitle(next: string, now = Date.now()) {
      title = next;
      sent = null;
      if (last) update(last, now);
    },
    update(snap: PlayerSnapshot, now = Date.now()) {
      update(snap, now);
    },
    clear() {
      if (!title) return;
      title = null;
      last = null;
      sent = null;
      void send("now_playing_clear").catch(() => {});
    },
  };
}
