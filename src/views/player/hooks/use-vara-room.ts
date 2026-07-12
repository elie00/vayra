// use-vara-room — the demo-room affordance + role/status surface (PR6).
//
// PRESENTATION GLUE ONLY. This hook drives the pure room state machine
// (room-machine.ts, §3.6) from the PR4 SyncTransport events so the UI can show
// solo/lobby/host/guest/connected/synced/syncing/desynced/error. It exposes an
// openRoom/leaveRoom affordance for the fixed room 'vara-demo'.
//
// It does NOT touch the player core or any control callback. The actual VEYA
// reconciler wiring lives in use-veya-sync (PR5); this hook only observes.
//
// SOLO PLAYBACK UNCHANGED: until openRoom() is called the machine is `solo`,
// no transport method is invoked and no subscription is live.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SyncTransport } from "@/lib/together/sync/transport";
import {
  initialRoomMachine,
  roomReducer,
  type RoomState,
} from "@/lib/together/sync/room-machine";

// The single fixed room for the prototype (see corrected architecture).
export const VARA_DEMO_ROOM = "vara-demo";

export interface VaraRoom {
  state: RoomState;
  role: "host" | "guest" | null;
  memberCount: number;
  inRoom: boolean;
  openRoom: () => void;
  leaveRoom: () => void;
}

export interface UseVaraRoomParams {
  // The local broker transport (LocalTransport). Null in contexts with no Tauri
  // bridge (e.g. plain web preview) — then the room affordance is inert.
  transport: SyncTransport | null;
  clientId: string;
}

export function useVaraRoom(params: UseVaraRoomParams): VaraRoom {
  const { transport, clientId } = params;
  const [machine, dispatch] = useReducer(roomReducer, initialRoomMachine);
  const [joined, setJoined] = useState(false);

  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;

  // Subscribe to membership only while a room is open. onMembers is seeded by
  // the broker `welcome` (roles) and refreshed by joined/left/host-changed.
  useEffect(() => {
    if (!joined || !transport) return;
    const off = transport.onMembers((members) => {
      dispatch({ type: "members", self: clientIdRef.current, members });
    });
    return off;
  }, [joined, transport]);

  const openRoom = useCallback(() => {
    if (joined) return;
    dispatch({ type: "openRoom" });
    setJoined(true);
    if (!transport) {
      // No local broker available — surface the error state (solo untouched).
      dispatch({ type: "error" });
      return;
    }
    try {
      transport.join(VARA_DEMO_ROOM);
    } catch {
      dispatch({ type: "error" });
    }
  }, [joined, transport]);

  const leaveRoom = useCallback(() => {
    if (!joined) return;
    setJoined(false);
    try {
      transport?.leave(VARA_DEMO_ROOM);
    } catch {
      // ignore — we return to solo regardless.
    }
    dispatch({ type: "leaveRoom" });
  }, [joined, transport]);

  const inRoom = machine.state !== "solo" && machine.state !== "error";

  return {
    state: machine.state,
    role: machine.role,
    memberCount: machine.memberCount,
    inRoom,
    openRoom,
    leaveRoom,
  };
}
