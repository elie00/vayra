// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { noteSwarmPeers, readSwarmPeers, SWARM_TTL_MS } from "./swarm-health";

const HASH = "9D2B067152F824489BE057651EDFC8E9654857CF";

beforeEach(() => localStorage.clear());

describe("swarm health", () => {
  it("keeps the most peers the engine reached for each torrent", () => {
    noteSwarmPeers(HASH, 3, 1_000);
    noteSwarmPeers(HASH, 12, 2_000);
    noteSwarmPeers(HASH, 5, 3_000);
    expect(readSwarmPeers(4_000)).toEqual({ [HASH.toLowerCase()]: 12 });
  });

  it("records a torrent that reached no peer, until one shows up", () => {
    noteSwarmPeers(HASH, 0, 1_000);
    expect(readSwarmPeers(2_000)[HASH.toLowerCase()]).toBe(0);
    noteSwarmPeers(HASH, 4, 3_000);
    expect(readSwarmPeers(4_000)[HASH.toLowerCase()]).toBe(4);
  });

  it("forgets what it saw once the swarm may have changed", () => {
    noteSwarmPeers(HASH, 8, 1_000);
    expect(readSwarmPeers(1_000 + SWARM_TTL_MS + 1)).toEqual({});
  });
});
