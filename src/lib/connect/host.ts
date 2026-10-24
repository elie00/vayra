import { invoke } from "@tauri-apps/api/core";
import type { PlayerSnapshot } from "@/lib/player/bridge";

// VAYRA Connect, Mac side: the Rust server (src-tauri/src/connect.rs) holds the
// phones' sockets; the front publishes the player's state and runs the commands.

export const CONNECT_COMMAND_EVENT = "vayra:connect-command";

export type ConnectInfo = { pairingUrl: string; address: string; name: string };
export type ConnectedPhone = { deviceId: string; name: string; platform: string };
export type ConnectStatus = { running: boolean; phones: ConnectedPhone[] };

export type ConnectMeta = { id: string; type: "movie" | "series"; name: string; poster?: string };
export type ConnectEpisode = { season: number; episode: number };

/** What a phone asked for, already rebuilt from known fields by the server. */
export type ConnectCommand =
  | { type: "command"; action: "play" | "pause" | "toggle" | "stop" }
  | { type: "command"; action: "seek"; position: number }
  | { type: "command"; action: "skip"; seconds: number }
  | { type: "command"; action: "volume"; level: number }
  | { type: "load"; meta: ConnectMeta; episode?: ConnectEpisode; startSec?: number };

export type ConnectState = {
  status: PlayerSnapshot["status"];
  positionSec: number;
  durationSec: number;
  rate: number;
  volume: number;
  muted: boolean;
  title: string;
  meta: ConnectMeta;
  episode?: ConnectEpisode;
  /** When `positionSec` was read, so phones can extrapolate while it plays. */
  at: number;
};

export const startConnect = () => invoke<ConnectInfo>("connect_start");
export const rotateConnect = () => invoke<ConnectInfo>("connect_rotate");
export const connectStatus = () => invoke<ConnectStatus>("connect_status");

export async function onConnectCommand(handler: (command: ConnectCommand) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ConnectCommand>(CONNECT_COMMAND_EVENT, (e) => handler(e.payload));
}

const DRIFT_SEC = 1.5;

type Send = (state: ConnectState | null) => Promise<unknown>;
type Media = { title: string; meta: ConnectMeta; episode?: ConnectEpisode };

/**
 * Publishes the player's state to paired phones when playback starts, stops,
 * seeks, changes speed, volume or title; phones extrapolate in between.
 */
export function createConnectPublisher(
  send: Send = (state) => invoke("connect_publish", { state }),
) {
  let sent: ConnectState | null = null;

  return {
    update(snap: PlayerSnapshot, media: Media, now = Date.now()) {
      if (snap.status === "idle") return;
      const state: ConnectState = {
        status: snap.status,
        positionSec: snap.positionSec,
        durationSec: snap.durationSec,
        rate: snap.rate,
        volume: snap.volume,
        muted: snap.muted,
        ...media,
        at: now,
      };
      if (sent && sameShape(sent, state)) {
        const playing = sent.status === "playing";
        const expected = sent.positionSec + (playing ? ((now - sent.at) / 1000) * sent.rate : 0);
        if (Math.abs(state.positionSec - expected) <= DRIFT_SEC) return;
      }
      sent = state;
      void send(state).catch(() => {});
    },
    clear() {
      if (!sent) return;
      sent = null;
      void send(null).catch(() => {});
    },
  };
}

function sameShape(a: ConnectState, b: ConnectState): boolean {
  return (
    a.status === b.status &&
    a.durationSec === b.durationSec &&
    a.rate === b.rate &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.title === b.title &&
    a.meta.id === b.meta.id &&
    a.episode?.season === b.episode?.season &&
    a.episode?.episode === b.episode?.episode
  );
}
