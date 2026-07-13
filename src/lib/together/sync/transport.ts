// SyncTransport — the shared seam implemented by the compatibility local broker
// and the authenticated remote Supabase Realtime transport.
//
// This interface intentionally hides the transport (Unix socket / named pipe /
// WebSocket relay) behind a narrow method surface. No imports from player/,
// tauri, or DOM.

import type { PlaybackCommand, PlaybackState, RoomId, RoomMember } from "./types";

// Unsubscribe handle returned by every on* registration.
export type Unsubscribe = () => void;

export interface SyncTransport {
  // Connect/disconnect this transport from a room. Persistent membership is a
  // repository concern and must not be mutated merely because a socket closes.
  join(room: RoomId): void;
  leave(room: RoomId): void;

  // Host-only: publish a playback command (play/pause/seek) to peers.
  sendCommand(cmd: PlaybackCommand): void;

  // Publish the current PlaybackState heartbeat/snapshot for the room.
  publishState(state: PlaybackState): void;

  // Incoming command from a peer (broker fans out to all except the author).
  onCommand(cb: (cmd: PlaybackCommand) => void): Unsubscribe;

  // Incoming state heartbeat from the authority.
  onState(cb: (state: PlaybackState) => void): Unsubscribe;

  // Late-join snapshot: the broker's retained last PlaybackState for the room.
  onSnapshot(cb: (state: PlaybackState) => void): Unsubscribe;

  // Room membership changes (joins/leaves/host re-election).
  onMembers(cb: (members: RoomMember[]) => void): Unsubscribe;

  // Tear down the transport and release all listeners.
  close(): void;
}
