import { describe, expect, it } from "vitest";
import { HARD_DRIFT, SOFT_DRIFT } from "./reconcile";
import {
  deriveRole,
  initialRoomMachine,
  isSolo,
  roomReducer,
  type RoomEvent,
  type RoomMachine,
} from "./room-machine";
import type { RoomMember } from "./types";

function member(clientId: string, isHost: boolean, joinedAtMs = 0): RoomMember {
  return { clientId, name: clientId, isHost, joinedAtMs };
}

// Fold a sequence of events over the initial machine.
function run(events: RoomEvent[], from: RoomMachine = initialRoomMachine): RoomMachine {
  return events.reduce(roomReducer, from);
}

describe("deriveRole (broker welcome roster)", () => {
  it("host when self is flagged isHost", () => {
    const role = deriveRole("me", [member("me", true), member("other", false)]);
    expect(role).toBe("host");
  });
  it("guest when another member is host", () => {
    const role = deriveRole("me", [member("me", false), member("other", true)]);
    expect(role).toBe("guest");
  });
  it("null when self is absent from the roster", () => {
    expect(deriveRole("me", [member("other", true)])).toBeNull();
  });
});

describe("solo <-> lobby", () => {
  it("starts solo", () => {
    expect(initialRoomMachine.state).toBe("solo");
    expect(isSolo("solo")).toBe(true);
  });
  it("openRoom(vara-demo): solo -> lobby", () => {
    expect(run([{ type: "openRoom" }]).state).toBe("lobby");
  });
  it("openRoom is a no-op when already in a room", () => {
    const m = run([{ type: "openRoom" }, { type: "openRoom" }]);
    expect(m.state).toBe("lobby");
  });
  it("leaveRoom returns to solo from any in-room state", () => {
    const m = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("me", true)] },
      { type: "leaveRoom" },
    ]);
    expect(m).toEqual(initialRoomMachine);
  });
});

describe("role assignment reflects broker welcome", () => {
  it("lobby -> host when self claims host (first in room)", () => {
    const m = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("me", true)] },
    ]);
    expect(m.state).toBe("host");
    expect(m.role).toBe("host");
  });
  it("lobby -> guest when another host present", () => {
    const m = run([
      { type: "openRoom" },
      {
        type: "members",
        self: "me",
        members: [member("host1", true), member("me", false)],
      },
    ]);
    // 2 members -> connected, but role is guest.
    expect(m.role).toBe("guest");
    expect(m.state).toBe("connected");
  });
  it("stays lobby while role unresolved (self not yet in roster)", () => {
    const m = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("host1", true)] },
    ]);
    expect(m.state).toBe("lobby");
    expect(m.role).toBeNull();
  });
  it("host-changed re-election flips role host->guest", () => {
    const m = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("me", true)] },
      // new host elected elsewhere
      {
        type: "members",
        self: "me",
        members: [member("me", false), member("other", true)],
      },
    ]);
    expect(m.role).toBe("guest");
  });
});

describe("host/guest -> connected", () => {
  it("host -> connected when a peer joins", () => {
    const m = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("me", true)] },
      {
        type: "members",
        self: "me",
        members: [member("me", true), member("peer", false)],
      },
    ]);
    expect(m.state).toBe("connected");
    expect(m.role).toBe("host");
    expect(m.memberCount).toBe(2);
  });
  it("connected -> host lobby again when the peer leaves", () => {
    const m = run([
      { type: "openRoom" },
      {
        type: "members",
        self: "me",
        members: [member("me", true), member("peer", false)],
      },
      { type: "members", self: "me", members: [member("me", true)] },
    ]);
    expect(m.state).toBe("host");
  });
});

describe("reconcile sub-states (connected -> synced/syncing/desynced)", () => {
  const connected = run([
    { type: "openRoom" },
    {
      type: "members",
      self: "me",
      members: [member("host1", true), member("me", false)],
    },
  ]);

  it("connected is the precondition for sub-states", () => {
    expect(connected.state).toBe("connected");
  });
  it("drift < SOFT_DRIFT -> synced", () => {
    const m = roomReducer(connected, {
      type: "drift",
      driftSec: SOFT_DRIFT - 0.1,
      buffering: false,
    });
    expect(m.state).toBe("synced");
  });
  it("drift in [soft, hard) -> syncing", () => {
    const m = roomReducer(connected, {
      type: "drift",
      driftSec: (SOFT_DRIFT + HARD_DRIFT) / 2,
      buffering: false,
    });
    expect(m.state).toBe("syncing");
  });
  it("buffering -> syncing regardless of drift", () => {
    const m = roomReducer(connected, {
      type: "drift",
      driftSec: 0,
      buffering: true,
    });
    expect(m.state).toBe("syncing");
  });
  it("drift >= HARD_DRIFT -> desynced", () => {
    const m = roomReducer(connected, {
      type: "drift",
      driftSec: HARD_DRIFT + 0.5,
      buffering: false,
    });
    expect(m.state).toBe("desynced");
  });
  it("synced -> syncing on incoming correction", () => {
    const synced = roomReducer(connected, {
      type: "drift",
      driftSec: 0,
      buffering: false,
    });
    expect(synced.state).toBe("synced");
    const m = roomReducer(synced, { type: "reconcile", action: "hard" });
    expect(m.state).toBe("syncing");
  });
  it("syncing -> synced once converged and not buffering", () => {
    const syncing = roomReducer(connected, {
      type: "reconcile",
      action: "soft",
    });
    expect(syncing.state).toBe("syncing");
    const m = roomReducer(syncing, {
      type: "drift",
      driftSec: SOFT_DRIFT - 0.2,
      buffering: false,
    });
    expect(m.state).toBe("synced");
  });
  it("desynced -> syncing on retry hard seek", () => {
    const desynced = roomReducer(connected, {
      type: "drift",
      driftSec: HARD_DRIFT + 1,
      buffering: false,
    });
    expect(desynced.state).toBe("desynced");
    const m = roomReducer(desynced, { type: "reconcile", action: "hard" });
    expect(m.state).toBe("syncing");
  });
  it("membership refresh preserves the reconcile sub-state", () => {
    const synced = roomReducer(connected, {
      type: "drift",
      driftSec: 0,
      buffering: false,
    });
    const m = roomReducer(synced, {
      type: "members",
      self: "me",
      members: [member("host1", true), member("me", false), member("c", false)],
    });
    // Still synced (not reset to connected), count refreshed.
    expect(m.state).toBe("synced");
    expect(m.memberCount).toBe(3);
  });
  it("reconcile/drift are ignored before connected (lobby/host)", () => {
    const host = run([
      { type: "openRoom" },
      { type: "members", self: "me", members: [member("me", true)] },
    ]);
    expect(host.state).toBe("host");
    const m = roomReducer(host, { type: "drift", driftSec: 5, buffering: false });
    expect(m.state).toBe("host");
  });
});

describe("error + reconnect", () => {
  it("connected -> error on broker disconnect", () => {
    const m = run([
      { type: "openRoom" },
      {
        type: "members",
        self: "me",
        members: [member("me", true), member("peer", false)],
      },
      { type: "error" },
    ]);
    expect(m.state).toBe("error");
    expect(m.role).toBeNull();
  });
  it("lobby -> error when the broker is unreachable", () => {
    const m = run([{ type: "openRoom" }, { type: "error" }]);
    expect(m.state).toBe("error");
  });
  it("error does NOT touch the solo path", () => {
    const m = roomReducer(initialRoomMachine, { type: "error" });
    expect(m.state).toBe("solo");
  });
  it("error -> lobby on reconnect", () => {
    const m = run([
      { type: "openRoom" },
      { type: "error" },
      { type: "reconnect" },
    ]);
    expect(m.state).toBe("lobby");
  });
  it("reconnect is a no-op outside error", () => {
    const lobby = run([{ type: "openRoom" }]);
    expect(roomReducer(lobby, { type: "reconnect" }).state).toBe("lobby");
  });
});
