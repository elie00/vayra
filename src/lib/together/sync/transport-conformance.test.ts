// Shared conformance suite for SyncTransport implementations.
//
// The SAME behavioural spec runs against BOTH FakeTransport (pure in-memory) and
// LocalTransport (Tauri invoke/listen mocked). This proves the two are
// replaceable behind the SyncTransport seam and that LocalTransport serializes
// commands/state/join over the correct vayra_sync_* commands and reacts to the
// correct vayra://sync-* events.

import { describe, expect, it } from "vitest";

import type { PlaybackCommand, PlaybackState, RoomId, RoomMember } from "./types";
import type { SyncTransport } from "./transport";
import { FakeHub, FakeTransport } from "./fake-transport";
import {
  LocalTransport,
  type TauriBridge,
} from "./local-transport";

// --- Test fixtures -----------------------------------------------------------

const ROOM: RoomId = "vara-demo";

function cmd(rev: number, member = "c1", seq = 1): PlaybackCommand {
  return { action: "pause", origin: "local", corr: { member, seq }, rev, atMs: 100 };
}

function state(rev: number, updatedBy = "c1", host = "c1"): PlaybackState {
  return {
    rev,
    playing: true,
    positionSec: 12.5,
    rate: 1,
    buffering: false,
    ended: false,
    anchorAtMs: 1000,
    updatedBy,
    hostClientId: host,
  };
}

// A harness lets a test create N transports that share ONE logical room. For
// LocalTransport the shared mock broker drives each client's mocked listen
// handlers; for FakeTransport the shared FakeHub does the fan-out directly.
interface Harness {
  name: string;
  makeClient(clientId: string, name: string): SyncTransport;
}

// ---- FakeTransport harness ----
function fakeHarness(): Harness {
  const hub = new FakeHub();
  return {
    name: "FakeTransport",
    makeClient: (clientId, name) => new FakeTransport({ clientId, name, hub }),
  };
}

// ---- LocalTransport harness ----
// A shared in-memory broker mirrors the FakeHub rules, but drives each client
// through its MOCKED Tauri listen handlers, exercising the real serialization
// path (invoke args) and event decoding in LocalTransport.
type Listener = (e: { payload: unknown }) => void;

interface MockClientWiring {
  clientId: string;
  name: string;
  listeners: Map<string, Listener[]>;
  room: RoomId | null;
}

function localHarness(): Harness {
  const clients: MockClientWiring[] = [];
  const rooms = new Map<
    RoomId,
    { rev: number; snapshot: PlaybackState | null; members: MockClientWiring[] }
  >();

  const emitTo = (w: MockClientWiring, event: string, payload: unknown) => {
    for (const l of w.listeners.get(event) ?? []) l({ payload });
  };

  const broadcastMembers = (room: RoomId) => {
    const r = rooms.get(room);
    if (!r) return;
    const hostId = r.members[0]?.clientId;
    for (const w of r.members) {
      // Broker fans out via member events; here we hand LocalTransport a
      // welcome each time so its roster reflects the full set deterministically.
      const members: RoomMember[] = r.members.map((m, i) => ({
        clientId: m.clientId,
        name: m.name,
        isHost: m.clientId === hostId,
        joinedAtMs: i,
      }));
      emitTo(w, "vayra://sync-welcome", {
        t: "welcome",
        room,
        clientId: w.clientId,
        role: w.clientId === hostId ? "host" : "guest",
        rev: r.rev,
        snapshot: r.snapshot,
        members,
      });
    }
  };

  const brokerInvoke = (w: MockClientWiring): TauriBridge["invoke"] => {
    return async (command: string, args?: Record<string, unknown>) => {
      if (command === "vayra_sync_join") {
        const room = args!.room as RoomId;
        w.room = room;
        let r = rooms.get(room);
        if (!r) {
          r = { rev: 0, snapshot: null, members: [] };
          rooms.set(room, r);
        }
        if (!r.members.includes(w)) r.members.push(w);
        broadcastMembers(room);
      } else if (command === "vayra_sync_leave") {
        const room = args!.room as RoomId;
        const r = rooms.get(room);
        if (r) {
          r.members = r.members.filter((m) => m !== w);
          if (r.members.length === 0) rooms.delete(room);
          else broadcastMembers(room);
        }
        w.room = null;
      } else if (command === "vayra_sync_send") {
        const room = args!.room as RoomId;
        const c = args!.cmd as PlaybackCommand;
        const r = rooms.get(room);
        if (r) {
          r.rev += 1;
          const stamped = { ...c, rev: r.rev };
          for (const m of r.members) {
            if (m !== w) emitTo(m, "vayra://sync-cmd", { t: "cmd", room, cmd: stamped });
          }
        }
      } else if (command === "vayra_sync_publish") {
        const room = args!.room as RoomId;
        const s = args!.statePayload as PlaybackState;
        const r = rooms.get(room);
        if (r) {
          r.rev += 1;
          const stamped = { ...s, rev: r.rev };
          r.snapshot = stamped;
          for (const m of r.members) {
            if (m !== w)
              emitTo(m, "vayra://sync-state", { t: "state", room, state: stamped, rev: r.rev });
          }
        }
      }
      return undefined;
    };
  };

  const makeListen = (w: MockClientWiring): TauriBridge["listen"] => {
    return (async (event: string, handler: Listener) => {
      const arr = w.listeners.get(event) ?? [];
      arr.push(handler);
      w.listeners.set(event, arr);
      return () => {
        const cur = w.listeners.get(event) ?? [];
        w.listeners.set(
          event,
          cur.filter((h) => h !== handler),
        );
      };
    }) as TauriBridge["listen"];
  };

  return {
    name: "LocalTransport",
    makeClient: (clientId, name) => {
      const w: MockClientWiring = { clientId, name, listeners: new Map(), room: null };
      clients.push(w);
      const bridge: TauriBridge = {
        invoke: brokerInvoke(w),
        listen: makeListen(w),
      };
      return new LocalTransport({ clientId, name, bridge });
    },
  };
}

// Flush the microtask queue so LocalTransport's async ensureWired()/invoke
// promise chains settle before assertions.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe.each([fakeHarness, localHarness])("SyncTransport conformance", (mk) => {
  it("fans a command out to peers but not the author", async () => {
    const H = mk();
    const host = H.makeClient("c1", "Host");
    const guest = H.makeClient("c2", "Guest");
    const hostGot: PlaybackCommand[] = [];
    const guestGot: PlaybackCommand[] = [];
    host.onCommand((c) => hostGot.push(c));
    guest.onCommand((c) => guestGot.push(c));

    host.join(ROOM);
    guest.join(ROOM);
    await flush();

    host.sendCommand(cmd(0));
    await flush();

    expect(hostGot).toHaveLength(0); // author excluded
    expect(guestGot).toHaveLength(1);
    expect(guestGot[0]!.action).toBe("pause");
    expect(guestGot[0]!.rev).toBe(1); // broker stamped monotone rev

    host.close();
    guest.close();
  });

  it("delivers state heartbeats to peers only", async () => {
    const H = mk();
    const a = H.makeClient("c1", "A");
    const b = H.makeClient("c2", "B");
    const aGot: PlaybackState[] = [];
    const bGot: PlaybackState[] = [];
    a.onState((s) => aGot.push(s));
    b.onState((s) => bGot.push(s));

    a.join(ROOM);
    b.join(ROOM);
    await flush();

    a.publishState(state(0));
    await flush();

    expect(aGot).toHaveLength(0);
    expect(bGot).toHaveLength(1);
    expect(bGot[0]!.positionSec).toBe(12.5);
    expect(bGot[0]!.rev).toBe(1);

    a.close();
    b.close();
  });

  it("hands a late joiner the retained snapshot", async () => {
    const H = mk();
    const host = H.makeClient("c1", "Host");
    host.join(ROOM);
    await flush();
    host.publishState(state(0));
    await flush();

    const late = H.makeClient("c2", "Late");
    const snaps: PlaybackState[] = [];
    late.onSnapshot((s) => snaps.push(s));
    late.join(ROOM);
    await flush();

    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.positionSec).toBe(12.5);

    host.close();
    late.close();
  });

  it("reports membership with the first joiner as host", async () => {
    const H = mk();
    const host = H.makeClient("c1", "Host");
    const guest = H.makeClient("c2", "Guest");
    let latest: RoomMember[] = [];
    host.onMembers((m) => (latest = m));

    host.join(ROOM);
    await flush();
    guest.join(ROOM);
    await flush();

    expect(latest.map((m) => m.clientId).sort()).toEqual(["c1", "c2"]);
    const hostMember = latest.find((m) => m.clientId === "c1");
    expect(hostMember?.isHost).toBe(true);
    expect(latest.find((m) => m.clientId === "c2")?.isHost).toBe(false);

    host.close();
    guest.close();
  });

  it("stops delivering after close()", async () => {
    const H = mk();
    const a = H.makeClient("c1", "A");
    const b = H.makeClient("c2", "B");
    const bGot: PlaybackCommand[] = [];
    b.onCommand((c) => bGot.push(c));

    a.join(ROOM);
    b.join(ROOM);
    await flush();

    b.close();
    a.sendCommand(cmd(0));
    await flush();

    expect(bGot).toHaveLength(0);
    a.close();
  });
});
