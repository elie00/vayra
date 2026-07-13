import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { VaraRemoteRoom, VaraRepository } from "@/lib/vara/types";
import type { PlaybackCommand, PlaybackState, RoomMember } from "./types";
import { WebSocketTransport } from "./websocket-transport";

const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000b2";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";

const ROOM: VaraRemoteRoom = {
  id: ROOM_ID,
  ownerId: USER_A,
  hostId: USER_A,
  topic: "vara:11111111111111111111111111111111",
  hostEpoch: 7,
  hostLeaseUntil: "2026-07-13T23:00:00Z",
  maxMembers: 8,
  createdAt: "2026-07-13T22:00:00Z",
  expiresAt: "2026-07-14T02:00:00Z",
  members: [
    { userId: USER_A, handle: "alice", displayName: "Alice", avatarKey: null, isHost: true, joinedAt: "2026-07-13T22:00:00Z" },
    { userId: USER_B, handle: "bob", displayName: "Bob", avatarKey: null, isHost: false, joinedAt: "2026-07-13T22:01:00Z" },
  ],
};

type Handler = (payload: { payload?: unknown }) => void;

class FakeChannel {
  readonly handlers = new Map<string, Handler[]>();
  readonly send = vi.fn().mockResolvedValue("ok");
  readonly track = vi.fn().mockResolvedValue("ok");
  presence: Record<string, unknown[]> = {};
  subscribeCallback: ((status: string) => void) | null = null;

  on(type: string, filter: { event: string }, callback: Handler): this {
    const key = `${type}:${filter.event}`;
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), callback]);
    return this;
  }
  subscribe(callback?: (status: string) => void): this {
    this.subscribeCallback = callback ?? null;
    return this;
  }
  presenceState(): Record<string, unknown[]> {
    return this.presence;
  }
  status(status: string): void {
    this.subscribeCallback?.(status);
  }
  emit(type: string, event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(`${type}:${event}`) ?? []) {
      handler({ payload });
    }
  }
}

function makeHarness(room: VaraRemoteRoom = ROOM) {
  const channels: Array<{ topic: string; options: unknown; channel: FakeChannel }> = [];
  const client = {
    channel: vi.fn((topic: string, options: unknown) => {
      const channel = new FakeChannel();
      channels.push({ topic, options, channel });
      return channel as unknown as RealtimeChannel;
    }),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  } as unknown as SupabaseClient;
  const repository = {
    getRoom: vi.fn().mockResolvedValue(room),
    leaveRoom: vi.fn().mockResolvedValue(undefined),
    renewHostLease: vi.fn().mockResolvedValue(room.hostLeaseUntil),
    claimHost: vi.fn().mockResolvedValue(room),
  } as unknown as VaraRepository;
  const transport = new WebSocketTransport({
    client,
    repository,
    userId: USER_A,
    clientId: "client-a",
    now: () => Date.parse("2026-07-13T22:10:00Z"),
  });
  return { client, repository, transport, channels };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WebSocketTransport", () => {
  it("joins the opaque private channel and requests a memory-only snapshot", async () => {
    const h = makeHarness();
    h.transport.join(ROOM_ID);
    await flush();
    const roomChannel = h.channels.find((entry) => entry.topic === ROOM.topic)!;
    expect(roomChannel.options).toMatchObject({
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    roomChannel.channel.status("SUBSCRIBED");
    await flush();
    expect(roomChannel.channel.track).toHaveBeenCalledWith({
      userId: USER_A,
      clientId: "client-a",
      joinedAtMs: Date.parse("2026-07-13T22:10:00Z"),
    });
    expect(roomChannel.channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "snapshot-request",
      payload: { clientId: "client-a" },
    });
    h.transport.close();
  });

  it("builds the roster from active presence but trusts CIRA display names", async () => {
    const h = makeHarness();
    const rosters: RoomMember[][] = [];
    h.transport.onMembers((members) => rosters.push(members));
    h.transport.join(ROOM_ID);
    await flush();
    const channel = h.channels.find((entry) => entry.topic === ROOM.topic)!.channel;
    channel.presence = {
      a: [{ userId: USER_A, clientId: "client-a", joinedAtMs: 1, name: "Spoofed" }],
      b: [{ userId: USER_B, clientId: "client-b", joinedAtMs: 2, name: "Spoofed" }],
      stranger: [{ userId: "stranger", clientId: "client-x", joinedAtMs: 3 }],
    };
    channel.emit("presence", "sync");
    expect(rosters.at(-1)).toEqual([
      { clientId: "client-a", name: "Alice", isHost: true, joinedAtMs: 1 },
      { clientId: "client-b", name: "Bob", isHost: false, joinedAtMs: 2 },
    ]);
    h.transport.close();
  });

  it("accepts only strict playback-intent messages and forces remote origin", async () => {
    const h = makeHarness();
    const commands: PlaybackCommand[] = [];
    const states: PlaybackState[] = [];
    h.transport.onCommand((command) => commands.push(command));
    h.transport.onState((state) => states.push(state));
    h.transport.join(ROOM_ID);
    await flush();
    const channel = h.channels.find((entry) => entry.topic === ROOM.topic)!.channel;
    channel.emit("broadcast", "cmd", {
      action: "seek",
      origin: "local",
      corr: { member: "client-b", seq: 2 },
      rev: 7_000_002,
      atMs: 100,
      positionSeconds: 42,
    });
    channel.emit("broadcast", "cmd", { action: "seek", source: "https://leak" });
    channel.emit("broadcast", "state", {
      rev: 7_000_003,
      playing: true,
      positionSec: 42,
      rate: 1,
      buffering: false,
      ended: false,
      anchorAtMs: 100,
      updatedBy: "client-a",
      hostClientId: "client-a",
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.origin).toBe("remote");
    expect(states).toHaveLength(1);
    h.transport.close();
  });

  it("lets only the deterministic host device publish authoritative state", async () => {
    const h = makeHarness();
    h.transport.join(ROOM_ID);
    await flush();
    const channel = h.channels.find((entry) => entry.topic === ROOM.topic)!.channel;
    channel.presence = {
      host: [
        { userId: USER_A, clientId: "client-z", joinedAtMs: 2 },
        { userId: USER_A, clientId: "client-a", joinedAtMs: 1 },
      ],
    };
    channel.status("SUBSCRIBED");
    await flush();
    channel.send.mockClear();
    h.transport.publishState({
      rev: 0,
      playing: true,
      positionSec: 10,
      rate: 1,
      buffering: false,
      ended: false,
      anchorAtMs: 0,
      updatedBy: "ignored",
      hostClientId: "ignored",
    });
    await flush();
    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "state",
      payload: expect.objectContaining({
        rev: 7_000_001,
        updatedBy: "client-a",
        hostClientId: "client-a",
      }),
    });
    h.transport.close();
  });

  it("answers late-join snapshot requests from memory without database state", async () => {
    const h = makeHarness();
    h.transport.join(ROOM_ID);
    await flush();
    const channel = h.channels.find((entry) => entry.topic === ROOM.topic)!.channel;
    channel.presence = { host: [{ userId: USER_A, clientId: "client-a", joinedAtMs: 1 }] };
    h.transport.publishState({
      rev: 0,
      playing: false,
      positionSec: 20,
      rate: 1,
      buffering: false,
      ended: false,
      anchorAtMs: 0,
      updatedBy: "ignored",
      hostClientId: "ignored",
    });
    await flush();
    channel.send.mockClear();
    channel.emit("broadcast", "snapshot-request", { clientId: "client-b" });
    await flush();
    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "snapshot",
      payload: expect.objectContaining({ positionSec: 20 }),
    });
    h.transport.close();
  });

  it("rejoins a rotated topic after the per-user CIRA invalidation", async () => {
    const h = makeHarness();
    const rotated = { ...ROOM, topic: "vara:22222222222222222222222222222222", hostEpoch: 8 };
    vi.mocked(h.repository.getRoom)
      .mockResolvedValueOnce(ROOM)
      .mockResolvedValueOnce(rotated)
      .mockResolvedValueOnce(rotated);
    h.transport.join(ROOM_ID);
    await flush();
    const invalidation = h.channels.find((entry) => entry.topic === `cira:${USER_A}`)!.channel;
    invalidation.emit("broadcast", "changed", {});
    await flush();
    await flush();
    expect(h.channels.some((entry) => entry.topic === rotated.topic)).toBe(true);
    h.transport.close();
  });

  it("keeps monotone VEYA revisions across a same-host topic rotation", async () => {
    const h = makeHarness();
    const rotated = { ...ROOM, topic: "vara:33333333333333333333333333333333" };
    vi.mocked(h.repository.getRoom)
      .mockResolvedValueOnce(ROOM)
      .mockResolvedValueOnce(rotated)
      .mockResolvedValueOnce(rotated);
    h.transport.join(ROOM_ID);
    await flush();
    const first = h.channels.find((entry) => entry.topic === ROOM.topic)!.channel;
    first.presence = { host: [{ userId: USER_A, clientId: "client-a", joinedAtMs: 1 }] };
    h.transport.publishState({
      rev: 0, playing: true, positionSec: 1, rate: 1, buffering: false, ended: false,
      anchorAtMs: 0, updatedBy: "ignored", hostClientId: "ignored",
    });
    await flush();
    expect(first.send).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ rev: 7_000_001 }),
    }));

    h.channels.find((entry) => entry.topic === `cira:${USER_A}`)!.channel
      .emit("broadcast", "changed", {});
    await flush();
    await flush();
    const second = h.channels.find((entry) => entry.topic === rotated.topic)!.channel;
    second.presence = { host: [{ userId: USER_A, clientId: "client-a", joinedAtMs: 2 }] };
    h.transport.publishState({
      rev: 0, playing: true, positionSec: 2, rate: 1, buffering: false, ended: false,
      anchorAtMs: 0, updatedBy: "ignored", hostClientId: "ignored",
    });
    await flush();
    expect(second.send).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ rev: 7_000_002 }),
    }));
    h.transport.close();
  });

  it("leaves server membership and tears down channels", async () => {
    const h = makeHarness();
    h.transport.join(ROOM_ID);
    await flush();
    h.transport.leave(ROOM_ID);
    await flush();
    expect(h.repository.leaveRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(h.client.removeChannel).toHaveBeenCalled();
    h.transport.close();
  });
});
