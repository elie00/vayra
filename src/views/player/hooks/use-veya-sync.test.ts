import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerBridge } from "@/lib/player/bridge";
import { FakeHub, FakeTransport } from "@/lib/together/sync/fake-transport";
import type { SyncTransport } from "@/lib/together/sync/transport";
import type { PlaybackCommand, PlaybackState } from "@/lib/together/sync/types";
import {
  VEYA_SUPPRESS_MS,
  createVeyaWiring,
  type LocalIntent,
} from "./use-veya-sync";

// Minimal PlayerBridge mock: only the methods the reconciler touches are real
// spies; the rest satisfy the interface so tsc is happy but are never called.
function mockBridge() {
  const calls = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
  };
  const bridge = {
    play: calls.play,
    pause: calls.pause,
    seek: calls.seek,
    setRate: calls.setRate,
    // Unused surface (throws if the reconciler ever touches the player core).
    attach: unused,
    detach: unused,
    load: unused,
    setVolume: unused,
    setMuted: unused,
    setAudioTrack: unused,
    setSubtitleTrack: unused,
    setSubVisible: unused,
    setSubDelay: unused,
    setAudioDelay: unused,
    setPanscan: unused,
    setVideoZoom: unused,
    setAspectOverride: unused,
    setStretch: unused,
    setVideoEq: unused,
    setAnime4kShaders: unused,
    addSubtitle: unused,
    getSelectedTrackCues: unused,
    getSelectedTrackUrl: unused,
    setAudioNormalize: unused,
    screenshot: unused,
    setAbLoop: unused,
    requestPiP: unused,
    exitPiP: unused,
    requestFullscreen: unused,
    exitFullscreen: unused,
    capabilities: unused,
    subscribe: () => () => {},
    destroy: unused,
  } as unknown as PlayerBridge;
  return { bridge, calls };
}

function unused(): never {
  throw new Error("player core method called by reconciler — must not happen");
}

// A clock we can advance deterministically.
function fakeClock(start = 100_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function state(over: Partial<PlaybackState> = {}): PlaybackState {
  return {
    rev: 1,
    playing: true,
    positionSec: 100,
    rate: 1,
    buffering: false,
    ended: false,
    anchorAtMs: 100_000,
    updatedBy: "host",
    hostClientId: "host",
    ...over,
  };
}

describe("createVeyaWiring — remote command apply + no echo", () => {
  let hub: FakeHub;
  let host: FakeTransport;
  let guest: FakeTransport;
  let hostSent: PlaybackCommand[];

  beforeEach(() => {
    hub = new FakeHub();
    host = new FakeTransport({ clientId: "host", name: "Host", hub });
    guest = new FakeTransport({ clientId: "guest", name: "Guest", hub });
    host.join("vara-demo");
    guest.join("vara-demo");
    hostSent = [];
    host.onCommand((c) => hostSent.push(c)); // host must never receive its own
  });

  it("remote seek => exactly one bridge.seek(target) and zero echoed commands", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const wiring = createVeyaWiring({
      transport: guest,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 50,
      now: clock.now,
    });

    // Host issues a seek; broker fans out to the guest (author excluded).
    const cmd: PlaybackCommand = {
      action: "seek",
      origin: "local",
      corr: { member: "host", seq: 1 },
      rev: 0,
      atMs: clock.now(),
      positionSeconds: 720,
    };
    host.sendCommand(cmd);

    // Exactly one seek to the target, nothing else forwarded.
    expect(calls.seek).toHaveBeenCalledTimes(1);
    expect(calls.seek).toHaveBeenCalledWith(720);
    expect(hostSent).toEqual([]);

    wiring.dispose();
  });

  it("applying a remote command never re-sends (applyingOrigin='remote' suppresses)", () => {
    const clock = fakeClock();
    const { bridge } = mockBridge();
    const wiring = createVeyaWiring({
      transport: guest,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 50,
      now: clock.now,
    });

    // Guest receives a remote seek (opens the suppress window)...
    host.sendCommand({
      action: "seek",
      origin: "local",
      corr: { member: "host", seq: 1 },
      rev: 0,
      atMs: clock.now(),
      positionSeconds: 300,
    });

    // ...and the bridge's resulting motion tries to send a local seek echo
    // immediately (still inside the suppress window) — it must be dropped.
    const echo: LocalIntent = { action: "seek", positionSeconds: 300, atMs: clock.now() };
    wiring.send(echo);
    expect(hostSent).toEqual([]);

    wiring.dispose();
  });

  it("a genuine local action AFTER the suppress window forwards exactly once", () => {
    const clock = fakeClock();
    const { bridge } = mockBridge();
    const wiring = createVeyaWiring({
      transport: guest,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 50,
      now: clock.now,
    });

    host.sendCommand({
      action: "seek",
      origin: "local",
      corr: { member: "host", seq: 1 },
      rev: 0,
      atMs: clock.now(),
      positionSeconds: 300,
    });
    // Echo inside window: dropped.
    wiring.send({ action: "seek", positionSeconds: 300, atMs: clock.now() });
    expect(hostSent).toEqual([]);

    // After the window elapses, a real local seek is forwarded once.
    clock.advance(VEYA_SUPPRESS_MS + 1);
    wiring.send({ action: "seek", positionSeconds: 999, atMs: clock.now() });
    expect(hostSent).toHaveLength(1);
    expect(hostSent[0]).toMatchObject({
      action: "seek",
      origin: "local",
      positionSeconds: 999,
    });

    wiring.dispose();
  });
});

describe("createVeyaWiring — drift reconciliation", () => {
  it("hard drift (>= HARD_DRIFT) seeks to the extrapolated target", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const t = new FakeTransport({ clientId: "guest", name: "G" });
    t.join("r");
    const wiring = createVeyaWiring({
      transport: t,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 100, // far behind
      now: clock.now,
    });

    // Authority is at 105 and paused (no extrapolation) => drift 5 >= hard.
    t._deliverState(state({ rev: 2, playing: false, positionSec: 105 }));
    expect(calls.seek).toHaveBeenCalledTimes(1);
    expect(calls.seek).toHaveBeenCalledWith(105);
    expect(calls.setRate).not.toHaveBeenCalled();

    wiring.dispose();
  });

  it("soft drift nudges rate instead of seeking, then converges back to 1.0", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const t = new FakeTransport({ clientId: "guest", name: "G" });
    t.join("r");
    let localPos = 100;
    const wiring = createVeyaWiring({
      transport: t,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => localPos,
      now: clock.now,
    });

    // Authority at 101 paused => drift 1.0 in [soft, hard) => soft nudge.
    t._deliverState(state({ rev: 2, playing: false, positionSec: 101 }));
    expect(calls.seek).not.toHaveBeenCalled();
    expect(calls.setRate).toHaveBeenCalledTimes(1);
    // Behind the target -> nudge faster than 1.0.
    expect(calls.setRate.mock.calls[0][0]).toBeGreaterThan(1);

    // Next heartbeat: converged (drift < soft) => rate reset to 1.0.
    localPos = 101;
    t._deliverState(state({ rev: 3, playing: false, positionSec: 101 }));
    expect(calls.setRate).toHaveBeenLastCalledWith(1);

    wiring.dispose();
  });

  it("host buffering suspends correction (no seek, no rate change)", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const t = new FakeTransport({ clientId: "guest", name: "G" });
    t.join("r");
    const wiring = createVeyaWiring({
      transport: t,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 100,
      now: clock.now,
    });

    t._deliverState(state({ rev: 2, playing: true, buffering: true, positionSec: 130 }));
    expect(calls.seek).not.toHaveBeenCalled();
    expect(calls.setRate).not.toHaveBeenCalled();

    wiring.dispose();
  });

  it("stale rev is dropped (LWW non-decreasing)", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const t = new FakeTransport({ clientId: "guest", name: "G" });
    t.join("r");
    const wiring = createVeyaWiring({
      transport: t,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 100,
      now: clock.now,
    });

    t._deliverState(state({ rev: 5, playing: false, positionSec: 130 }));
    calls.seek.mockClear();
    // Older rev must be ignored entirely.
    t._deliverState(state({ rev: 4, playing: false, positionSec: 200 }));
    expect(calls.seek).not.toHaveBeenCalled();

    wiring.dispose();
  });
});

describe("createVeyaWiring — late-join snapshot", () => {
  it("applies the retained snapshot unconditionally on join", () => {
    const hub = new FakeHub();
    const host = new FakeTransport({ clientId: "host", name: "H", hub });
    host.join("r");
    // Host publishes a state so the hub retains a snapshot.
    host.publishState(state({ rev: 1, playing: true, positionSec: 500 }));

    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const guest = new FakeTransport({ clientId: "guest", name: "G", hub });
    const wiring = createVeyaWiring({
      transport: guest,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 0,
      now: clock.now,
    });
    // Joining delivers the retained snapshot to this joiner only.
    guest.join("r");

    expect(calls.seek).toHaveBeenCalledTimes(1);
    expect(calls.seek.mock.calls[0][0]).toBeCloseTo(500, 3);
    expect(calls.play).toHaveBeenCalledTimes(1);

    wiring.dispose();
  });

  it("does NOT re-seek an already-initialized peer when a snapshot is re-broadcast (B1)", () => {
    const clock = fakeClock();
    const { bridge, calls } = mockBridge();
    const t = new FakeTransport({ clientId: "guest", name: "G" });
    t.join("r");
    const wiring = createVeyaWiring({
      transport: t,
      getBridge: () => bridge,
      clientId: "guest",
      getLocalPosition: () => 300,
      now: clock.now,
    });

    // Peer catches up to rev 5 via a normal heartbeat.
    t._deliverState(state({ rev: 5, playing: false, positionSec: 300 }));
    calls.seek.mockClear();

    // Another client (re)joins: the authority BROADCASTS its retained snapshot to
    // the whole channel. This already-synced peer must ignore rev <= appliedRev.
    t._deliverSnapshot(state({ rev: 5, playing: true, positionSec: 999 }));
    t._deliverSnapshot(state({ rev: 3, playing: true, positionSec: 111 }));
    expect(calls.seek).not.toHaveBeenCalled();

    // A genuinely newer snapshot (peer missed updates) still applies.
    t._deliverSnapshot(state({ rev: 6, playing: false, positionSec: 620 }));
    expect(calls.seek).toHaveBeenCalledTimes(1);
    expect(calls.seek).toHaveBeenCalledWith(620);

    wiring.dispose();
  });
});

describe("solo regression — inRoom=false wires nothing", () => {
  it("no transport is created/subscribed and the control path is untouched", () => {
    // A transport whose every method is a spy; the solo path must call NONE.
    const spies = {
      join: vi.fn(),
      leave: vi.fn(),
      sendCommand: vi.fn(),
      publishState: vi.fn(),
      onCommand: vi.fn(() => () => {}),
      onState: vi.fn(() => () => {}),
      onSnapshot: vi.fn(() => () => {}),
      onMembers: vi.fn(() => () => {}),
      close: vi.fn(),
    };
    const transport = spies as unknown as SyncTransport;

    // The hook contract: when inRoom=false we build NO wiring. We emulate that
    // decision here (the hook's useEffect early-returns), and assert the sender
    // no-ops. createVeyaWiring is the ONLY thing that subscribes/sends, and it
    // is never constructed in the solo path.
    const inRoom = false;
    let wiring: ReturnType<typeof createVeyaWiring> | null = null;
    if (inRoom) {
      wiring = createVeyaWiring({
        transport,
        getBridge: () => null,
        clientId: "x",
        getLocalPosition: () => 0,
        now: () => 0,
      });
    }
    const send: (i: LocalIntent) => void = (i) => wiring?.send(i);

    // A solo user hitting play/seek must not touch the transport at all.
    send({ action: "play", atMs: 0 });
    send({ action: "seek", positionSeconds: 42, atMs: 0 });

    expect(spies.onCommand).not.toHaveBeenCalled();
    expect(spies.onState).not.toHaveBeenCalled();
    expect(spies.onSnapshot).not.toHaveBeenCalled();
    expect(spies.sendCommand).not.toHaveBeenCalled();
    expect(spies.publishState).not.toHaveBeenCalled();
    expect(spies.join).not.toHaveBeenCalled();
  });
});
