// Sync contract types for VARA/VEYA playback-intent synchronization.
//
// Field names mirror PlayerSnapshot (src/lib/player/bridge.ts:28-52) and
// SyncState / RoomCommand (src/lib/together/protocol.ts:33-51).
//
// The wire never carries a PlayerSource / URL — only PlaybackState and
// PlaybackCommand cross the broker. No imports from player/, tauri, or DOM.

// Fixed local room, no codes needed for the demo; keep the 6-char shape reusable.
export type RoomId = string; // e.g. "vara-demo"

// Where an applied action came from — the anti-loop discriminator.
export type SyncOrigin = "local" | "remote";

// Monotone identity for a single logical intent, survives coalescing.
export interface CorrId {
  member: string; // clientId (localStorage "harbor.together.clientId")
  seq: number; // per-member monotone counter
}

// Grounded in PlayerSnapshot.status/positionSec/rate (bridge.ts:28-52)
// and SyncState (protocol.ts:33-46). Position-only intent, no media bytes.
export interface PlaybackState {
  rev: number; // monotone room revision
  playing: boolean; // snap.status === "playing"
  positionSec: number; // snap.positionSec at anchorAtMs
  rate: number; // snap.rate
  buffering: boolean; // snap.buffering
  ended: boolean; // snap.status === "ended"
  anchorAtMs: number; // Date.now() when positionSec sampled (for extrapolation)
  updatedBy: string; // clientId of author (host) — like SyncState.updatedBy
  hostClientId: string; // authority holder
}

// Grounded in RoomCommand (protocol.ts:48-51). Adds origin + corr + rev.
export type PlaybackCommand =
  | { action: "play"; origin: SyncOrigin; corr: CorrId; rev: number; atMs: number }
  | { action: "pause"; origin: SyncOrigin; corr: CorrId; rev: number; atMs: number }
  | {
      action: "seek";
      origin: SyncOrigin;
      corr: CorrId;
      rev: number;
      atMs: number;
      positionSeconds: number;
    };

// Minimal member model (subset of Participant, protocol.ts:3-10).
export interface RoomMember {
  clientId: string;
  name: string;
  isHost: boolean;
  joinedAtMs: number;
}
