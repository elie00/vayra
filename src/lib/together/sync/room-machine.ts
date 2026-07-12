// Pure VARA room state machine (§3.6). Models the demo room lifecycle + the
// reconciler sub-states as a deterministic reducer over events. No side effects,
// no imports from player/, tauri, React or DOM — so it is unit-testable in the
// node vitest env and reusable by the React hook.
//
// States (docs §3.6):
//   solo      — no room; the byte-for-byte-unchanged solo path.
//   lobby     — joined the room id, no role / authority resolved yet.
//   error     — broker unreachable (join invoke rejected); solo playback intact.
//   host      — this instance claimed host (first in room).
//   guest     — another host is present; this instance follows.
//   connected — >= 2 members present (host+guest wired).
//   synced    — |drift| < SOFT_DRIFT, not correcting, not buffering.
//   syncing   — a correction (seek / soft / hard) or buffering in progress.
//   desynced  — |drift| >= HARD_DRIFT persisting (correction failing).
//
// role is derived from the broker `welcome` / `host-changed` (member roster):
// the member whose clientId === self and isHost === true is host.

import { HARD_DRIFT, SOFT_DRIFT } from "./reconcile";
import type { RoomMember } from "./types";

export type RoomState =
  | "solo"
  | "lobby"
  | "error"
  | "host"
  | "guest"
  | "connected"
  | "synced"
  | "syncing"
  | "desynced";

export type RoomRole = "host" | "guest" | null;

// Events that drive the machine. Membership/role come from the transport's
// onMembers (seeded by broker `welcome`, updated by joined/left/host-changed);
// reconcile events come from the VEYA wiring seam.
export type RoomEvent =
  | { type: "openRoom" } // openRoom(vara-demo)
  | { type: "leaveRoom" } // leaveRoom -> solo
  | { type: "error" } // broker unreachable (invoke rejected)
  | { type: "reconnect" } // retry after error -> back to lobby
  | { type: "members"; self: string; members: RoomMember[] }
  | { type: "reconcile"; action: "none" | "soft" | "hard" | "suspend" }
  | { type: "drift"; driftSec: number; buffering: boolean };

export interface RoomMachine {
  state: RoomState;
  role: RoomRole;
  memberCount: number;
}

export const initialRoomMachine: RoomMachine = {
  state: "solo",
  role: null,
  memberCount: 0,
};

// Role from the roster: host iff self is present and flagged isHost.
export function deriveRole(self: string, members: RoomMember[]): RoomRole {
  const me = members.find((m) => m.clientId === self);
  if (!me) return null;
  return me.isHost ? "host" : "guest";
}

// The reconciler sub-states (synced/syncing/desynced) are only meaningful once
// >= 2 members are wired (state connected+). Below that, membership drives the
// state (lobby -> host/guest -> connected).
function isReconcilePhase(state: RoomState): boolean {
  return (
    state === "connected" ||
    state === "synced" ||
    state === "syncing" ||
    state === "desynced"
  );
}

function inRoom(state: RoomState): boolean {
  return state !== "solo" && state !== "error";
}

export function roomReducer(m: RoomMachine, e: RoomEvent): RoomMachine {
  switch (e.type) {
    case "openRoom":
      // Only leaves solo; a no-op if already in a room.
      if (m.state === "solo") return { ...m, state: "lobby" };
      return m;

    case "leaveRoom":
      return { ...initialRoomMachine };

    case "error":
      // Broker unreachable at any in-room point; solo path stays untouched.
      if (m.state === "solo") return m;
      return { state: "error", role: null, memberCount: 0 };

    case "reconnect":
      if (m.state === "error") return { ...initialRoomMachine, state: "lobby" };
      return m;

    case "members": {
      if (m.state === "solo" || m.state === "error") return m;
      const role = deriveRole(e.self, e.members);
      const count = e.members.length;
      // No resolved role yet -> still lobby.
      if (role == null) return { state: "lobby", role: null, memberCount: count };
      // >= 2 members: connected (unless already in a reconcile sub-state, then
      // keep the sub-state and just refresh role/count).
      if (count >= 2) {
        const next: RoomState = isReconcilePhase(m.state) ? m.state : "connected";
        return { state: next, role, memberCount: count };
      }
      // Solo member with a resolved role: host-or-guest lobby.
      return { state: role, role, memberCount: count };
    }

    case "drift": {
      if (!isReconcilePhase(m.state)) return m;
      if (e.buffering) return { ...m, state: "syncing" };
      if (e.driftSec >= HARD_DRIFT) return { ...m, state: "desynced" };
      if (e.driftSec < SOFT_DRIFT) return { ...m, state: "synced" };
      // In the [soft, hard) band a correction is in progress.
      return { ...m, state: "syncing" };
    }

    case "reconcile": {
      if (!isReconcilePhase(m.state)) return m;
      if (e.action === "none") return { ...m, state: "synced" };
      if (e.action === "suspend" || e.action === "soft")
        return { ...m, state: "syncing" };
      // hard: a retry hard-seek is a correction in progress.
      return { ...m, state: "syncing" };
    }

    default:
      return m;
  }
}

// Convenience for callers that only need to know whether solo playback is live.
export function isSolo(state: RoomState): boolean {
  return !inRoom(state);
}
