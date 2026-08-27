import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TogetherClient } from "./client";
import type { ServerMessage, SyncState } from "./protocol";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

const sockets: FakeWebSocket[] = [];

function sentMessages(socket: FakeWebSocket) {
  return socket.sent.map((message) => JSON.parse(message) as { t: string; state?: SyncState });
}

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Together client", () => {
  it("keeps only the latest queued playback state before connecting", () => {
    const client = new TogetherClient("https://relay.example/", "me", "Alice");
    client.join("ROOM");
    client.publishState({
      mediaId: "first",
      mediaTitle: "First",
      episode: null,
      posterUrl: null,
      positionSeconds: 10,
      playing: true,
      updatedAt: 1,
      updatedBy: "me",
      hostClientId: "me",
    });
    client.publishState({
      mediaId: "second",
      mediaTitle: "Second",
      episode: null,
      posterUrl: null,
      positionSeconds: 20,
      playing: false,
      updatedAt: 2,
      updatedBy: "me",
      hostClientId: "me",
    });

    sockets[0].open();

    const states = sentMessages(sockets[0]).filter(({ t }) => t === "state");
    expect(states).toHaveLength(1);
    expect(states[0].state?.mediaId).toBe("second");
  });

  it("schedules a single reconnect after resolving a duplicate display name", () => {
    const client = new TogetherClient("relay.example", "z-client", "Alice");
    client.join("ROOM");
    sockets[0].open();

    sockets[0].receive({
      t: "joined",
      room: "ROOM",
      participants: [
        { id: "a-client", name: "Alice", joinedAt: 1, ready: false },
        { id: "z-client", name: "Alice", joinedAt: 2, ready: false },
      ],
      state: null,
      hostClientId: "a-client",
      started: false,
    });

    expect(vi.getTimerCount()).toBe(1);
  });
});
