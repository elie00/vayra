import { describe, expect, it } from "vitest";
import type { EngineStats } from "./engine-stats";
import { PEER_PROBLEM_AFTER_MS, peerProblem } from "./peer-problem";

const stats = (over: Partial<EngineStats>): EngineStats => ({
  peers: 0,
  unchoked: 0,
  downloaded: 0,
  downloadSpeed: 0,
  streamProgress: 0,
  streamLen: null,
  peerSearchRunning: true,
  peersSeen: 0,
  peersDead: 0,
  peersTrying: 0,
  finished: false,
  sawData: false,
  ...over,
});

const late = PEER_PROBLEM_AFTER_MS;

describe("peerProblem", () => {
  it("says nothing before the delay, whatever the counters", () => {
    expect(peerProblem(stats({}), late - 1)).toBeNull();
    expect(peerProblem(stats({ peersSeen: 12, peersDead: 12 }), late - 1)).toBeNull();
  });

  it("reports that no peer was found when the search found none", () => {
    expect(peerProblem(stats({ peersSeen: 0 }), late)).toBe("none-found");
  });

  it("reports lost peers when every found peer has ended", () => {
    expect(peerProblem(stats({ peersSeen: 40, peersDead: 3, peersTrying: 0 }), late)).toBe("all-lost");
    // Peers that left without an error are "not needed", not dead: still lost.
    expect(peerProblem(stats({ peersSeen: 40, peersDead: 0, peersTrying: 0 }), late)).toBe("all-lost");
  });

  it("stays quiet while found peers are still queued or connecting", () => {
    expect(peerProblem(stats({ peersSeen: 40, peersDead: 1, peersTrying: 15 }), late)).toBeNull();
  });

  it("keeps \"all-lost\" through a retry, as seen on 24/11 (seen 1, trying 0 then 1)", () => {
    const lost = peerProblem(stats({ peersSeen: 1, peersDead: 1, peersTrying: 0 }), late);
    expect(lost).toBe("all-lost");
    expect(peerProblem(stats({ peersSeen: 1, peersDead: 0, peersTrying: 1 }), late + 5_000, lost)).toBe("all-lost");
    // Until a peer is live: then the verdict goes.
    expect(peerProblem(stats({ peersSeen: 1, peersTrying: 0, peers: 1 }), late + 10_000, lost)).toBeNull();
    // "none-found" does not hold once peers turn up and are being tried.
    expect(peerProblem(stats({ peersSeen: 3, peersTrying: 3 }), late, "none-found")).toBeNull();
  });

  it("stays quiet while a peer is live or data flows", () => {
    expect(peerProblem(stats({ peersSeen: 40, peersDead: 30, peers: 1 }), late)).toBeNull();
    expect(peerProblem(stats({ peersSeen: 40, peersDead: 30, unchoked: 1 }), late)).toBeNull();
    expect(peerProblem(stats({ peersSeen: 0, downloadSpeed: 2048 }), late)).toBeNull();
  });

  it("stays quiet when the search is not running (checking files, paused) or the torrent is done", () => {
    expect(peerProblem(stats({ peerSearchRunning: false }), late * 10)).toBeNull();
    expect(peerProblem(stats({ finished: true }), late * 10)).toBeNull();
  });

  it("says nothing without stats, or from an engine that does not count peers", () => {
    expect(peerProblem(null, late * 10)).toBeNull();
    expect(peerProblem(stats({ peersSeen: null, peersDead: null, peersTrying: null }), late * 10)).toBeNull();
  });
});
