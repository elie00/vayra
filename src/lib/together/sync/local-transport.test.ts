// LocalTransport unit test — exercises the REAL default bridge path by mocking
// the @tauri-apps/api modules it dynamically imports. Proves correct command
// names + serialized args and that vayra://sync-* events are decoded onto the
// right seams. (Replaceability vs FakeTransport is covered by the shared
// conformance suite; this file pins the Tauri wire.)

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackCommand, PlaybackState } from "./types";
import { LocalTransport } from "./local-transport";

// --- Mock @tauri-apps/api/core (invoke) and /event (listen) ---
// Hoisted so the vi.mock factories (also hoisted) can reference them safely.
const { invokeMock, listenMock, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, Array<(e: { payload: unknown }) => void>>();
  const invokeMock = vi.fn(
    async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => undefined,
  );
  const listenMock = vi.fn(
    async (event: string, handler: (e: { payload: unknown }) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
      return () => {
        const cur = listeners.get(event) ?? [];
        listeners.set(
          event,
          cur.filter((h) => h !== handler),
        );
      };
    },
  );
  return { invokeMock, listenMock, listeners };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function emit(event: string, payload: unknown): void {
  for (const h of listeners.get(event) ?? []) h({ payload });
}

// The default bridge resolves two dynamic imports before invoke/listen fire, so
// settle on macrotasks (microtask flushes are not enough). Spin several
// event-loop turns rather than a fixed wall-clock delay: under a loaded
// full-suite run a single 10ms wait can race the dynamic imports (flake).
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

const sampleState: PlaybackState = {
  rev: 4,
  playing: true,
  positionSec: 30,
  rate: 1,
  buffering: false,
  ended: false,
  anchorAtMs: 2000,
  updatedBy: "c1",
  hostClientId: "c1",
};

const sampleCmd: PlaybackCommand = {
  action: "seek",
  origin: "local",
  corr: { member: "c1", seq: 2 },
  rev: 3,
  atMs: 500,
  positionSeconds: 42,
};

describe("LocalTransport (Tauri wire)", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    listenMock.mockClear();
    listeners.clear();
  });

  it("serializes join with camelCase clientId/name", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    t.join("vara-demo");
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("vayra_sync_join", {
      room: "vara-demo",
      clientId: "c1",
      name: "Alice",
    });
    t.close();
  });

  it("serializes command send under vayra_sync_send", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    t.join("vara-demo");
    await flush();
    t.sendCommand(sampleCmd);
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("vayra_sync_send", {
      room: "vara-demo",
      cmd: sampleCmd,
    });
    t.close();
  });

  it("serializes publish under statePayload arg name", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    t.join("vara-demo");
    await flush();
    t.publishState(sampleState);
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("vayra_sync_publish", {
      room: "vara-demo",
      statePayload: sampleState,
    });
    t.close();
  });

  it("does not invoke send/publish with no room (solo playback stays silent)", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    t.sendCommand(sampleCmd);
    t.publishState(sampleState);
    await flush();
    expect(invokeMock).not.toHaveBeenCalled();
    t.close();
  });

  it("decodes vayra://sync-cmd onto onCommand", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    const got: PlaybackCommand[] = [];
    t.onCommand((c) => got.push(c));
    t.join("vara-demo");
    await flush();
    emit("vayra://sync-cmd", { t: "cmd", room: "vara-demo", cmd: sampleCmd });
    expect(got).toEqual([sampleCmd]);
    t.close();
  });

  it("decodes vayra://sync-state onto onState", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    const got: PlaybackState[] = [];
    t.onState((s) => got.push(s));
    t.join("vara-demo");
    await flush();
    emit("vayra://sync-state", {
      t: "state",
      room: "vara-demo",
      state: sampleState,
      rev: sampleState.rev,
    });
    expect(got).toEqual([sampleState]);
    t.close();
  });

  it("surfaces welcome snapshot + roster and tracks joins/leaves", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    const snaps: PlaybackState[] = [];
    let members = new Array<{ clientId: string; isHost: boolean }>();
    t.onSnapshot((s) => snaps.push(s));
    t.onMembers((m) => (members = m));
    t.join("vara-demo");
    await flush();

    emit("vayra://sync-welcome", {
      t: "welcome",
      room: "vara-demo",
      clientId: "c1",
      role: "host",
      rev: 4,
      snapshot: sampleState,
      members: [{ clientId: "c1", name: "Alice", isHost: true, joinedAtMs: 0 }],
    });
    expect(snaps).toEqual([sampleState]);
    expect(members.map((m) => m.clientId)).toEqual(["c1"]);

    emit("vayra://sync-members", {
      t: "memberJoined",
      room: "vara-demo",
      member: { clientId: "c2", name: "Bob", isHost: false, joinedAtMs: 1 },
    });
    expect(members.map((m) => m.clientId)).toEqual(["c1", "c2"]);

    emit("vayra://sync-members", {
      t: "memberLeft",
      room: "vara-demo",
      member: { clientId: "c2", name: "Bob", isHost: false, joinedAtMs: 1 },
    });
    expect(members.map((m) => m.clientId)).toEqual(["c1"]);

    t.close();
  });

  it("flips isHost on vayra://sync-host host re-election", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    let members = new Array<{ clientId: string; isHost: boolean }>();
    t.onMembers((m) => (members = m));
    t.join("vara-demo");
    await flush();
    emit("vayra://sync-welcome", {
      t: "welcome",
      room: "vara-demo",
      clientId: "c1",
      role: "host",
      rev: 0,
      snapshot: null,
      members: [
        { clientId: "c1", name: "Alice", isHost: true, joinedAtMs: 0 },
        { clientId: "c2", name: "Bob", isHost: false, joinedAtMs: 1 },
      ],
    });
    emit("vayra://sync-host", {
      t: "hostChanged",
      room: "vara-demo",
      hostClientId: "c2",
    });
    expect(members.find((m) => m.clientId === "c2")?.isHost).toBe(true);
    expect(members.find((m) => m.clientId === "c1")?.isHost).toBe(false);
    t.close();
  });

  it("stops delivering events after close()", async () => {
    const t = new LocalTransport({ clientId: "c1", name: "Alice" });
    const got: PlaybackCommand[] = [];
    t.onCommand((c) => got.push(c));
    t.join("vara-demo");
    await flush();
    t.close();
    emit("vayra://sync-cmd", { t: "cmd", room: "vara-demo", cmd: sampleCmd });
    expect(got).toHaveLength(0);
  });
});
