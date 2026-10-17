// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { noteP2pThroughput, readP2pBandwidthMbps } from "./p2p-throughput";

beforeEach(() => localStorage.clear());

const MiB = 1024 * 1024;

it("remembers the best speed the engine reached lately, in Mbps", () => {
  expect(readP2pBandwidthMbps(0)).toBeUndefined();
  noteP2pThroughput(0.5 * MiB, 0);
  noteP2pThroughput(2 * MiB, 1_000);
  noteP2pThroughput(1 * MiB, 2_000);
  expect(readP2pBandwidthMbps(3_000)).toBeCloseTo(16.8, 1);
});

it("forgets it after a day, when the network may have changed", () => {
  noteP2pThroughput(5 * MiB, 0);
  expect(readP2pBandwidthMbps(23 * 3600_000)).toBeCloseTo(41.9, 1);
  expect(readP2pBandwidthMbps(25 * 3600_000)).toBeUndefined();
  noteP2pThroughput(0.25 * MiB, 25 * 3600_000);
  expect(readP2pBandwidthMbps(25 * 3600_000)).toBeCloseTo(2.1, 1);
});
