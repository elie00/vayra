import { describe, expect, it } from "vitest";
import type { ParsedStream } from "../types";
import { scoreStream } from "./scoring-stream";

const HASH = "9d2b067152f824489be057651edfc8e9654857cf";

const torrent = {
  name: "Torrentio",
  title: "Show.S01E01.1080p",
  infoHash: HASH.toUpperCase(),
  resolution: "1080p",
  source: "WEB-DL",
  codec: "Other",
  audio: { codec: "Other", channels: 2 },
  audioLanguages: [],
  cached: {},
  inLibrary: {},
  scamScore: 0,
  repackIteration: 0,
} as unknown as ParsedStream;

const signal = (s: ParsedStream, swarmPeers?: Record<string, number>) =>
  scoreStream(s, { activeDebrids: [], swarmPeers }).reasons.find((r) => r.signal.startsWith("swarm-"));

describe("reachable peers in the score", () => {
  it("demotes a torrent that reached no peer last time", () => {
    expect(signal(torrent, { [HASH]: 0 })).toEqual({ signal: "swarm-unreachable", delta: -25 });
  });

  it("promotes one whose peers the engine reached, up to a cap", () => {
    expect(signal(torrent, { [HASH]: 6 })).toEqual({ signal: "swarm-peers=6", delta: 3 });
    expect(signal(torrent, { [HASH]: 40 })).toEqual({ signal: "swarm-peers=40", delta: 10 });
  });

  it("leaves unknown torrents and ready links alone", () => {
    expect(signal(torrent, {})).toBeUndefined();
    expect(signal({ ...torrent, url: "https://cdn/a.mkv" } as ParsedStream, { [HASH]: 0 })).toBeUndefined();
  });
});

describe("the speed the engine reached in the score", () => {
  const uhd = { ...torrent, title: "Show.S01E01.2160p", resolution: "4K", size: 8.3e9 } as unknown as ParsedStream;
  const penalty = (s: ParsedStream, opts: { p2pBandwidthMbps?: number; bandwidthMbps?: number }) =>
    scoreStream(s, { activeDebrids: [], runtimeMinutes: 55, ...opts }).reasons.find((r) => r.signal.startsWith("bitrate-") || r.signal.startsWith("low-bandwidth"));

  it("demotes a torrent whose file needs more than the engine has managed lately", () => {
    // 8.3 GB over 55 minutes needs about 20 Mbps; the engine reached 5.
    expect(penalty(uhd, { p2pBandwidthMbps: 5 })?.delta).toBeLessThan(-40);
  });

  it("leaves it alone on a fast connection, for ready links, and when the user set a budget", () => {
    expect(penalty(uhd, { p2pBandwidthMbps: 300 })).toBeUndefined();
    expect(penalty({ ...uhd, url: "https://cdn/a.mkv" } as ParsedStream, { p2pBandwidthMbps: 5 })).toBeUndefined();
    expect(penalty(uhd, { p2pBandwidthMbps: 5, bandwidthMbps: 500 })).toBeUndefined();
  });
});
