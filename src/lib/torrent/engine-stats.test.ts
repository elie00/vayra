import { describe, expect, it } from "vitest";
import { parseEngineStats } from "./engine-stats";

describe("parseEngineStats peer counters", () => {
  it("keeps a reported zero, which means no peer was found", () => {
    const s = parseEngineStats({ peers: 0, peersSeen: 0, peersDead: 0 }, null);
    expect(s.peersSeen).toBe(0);
    expect(s.peersDead).toBe(0);
  });

  it("reads the built-in engine's counters", () => {
    const s = parseEngineStats({ peers: 0, peersSeen: 42, peersDead: 7, peersTrying: 3, finished: true }, null);
    expect(s.peersSeen).toBe(42);
    expect(s.peersDead).toBe(7);
    expect(s.peersTrying).toBe(3);
    expect(s.finished).toBe(true);
  });

  it("leaves them unknown for an engine that does not send them (Stremio server)", () => {
    const s = parseEngineStats({ peers: 3, downloadSpeed: 1024 }, null);
    expect(s.peersSeen).toBeNull();
    expect(s.peersDead).toBeNull();
    expect(s.peersTrying).toBeNull();
  });
});
