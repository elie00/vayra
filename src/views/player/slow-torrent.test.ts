import { expect, it } from "vitest";
import { torrentTooSlow } from "./slow-torrent";

const GB = 1e9;
// The Diplomat S04E03 in 2160p: 8.3 GB for a 55-minute episode needs about 2.5 MB/s.
const episode = { fileBytes: 8.3 * GB, runtimeMin: 55, type: "series" as const };
const flowing = (seconds: number, bytesPerSec: number) => ({
  ...episode,
  ageMs: (seconds + 10) * 1000,
  flowingMs: seconds * 1000,
  bytesSinceFlow: bytesPerSec * seconds,
});

it("judges the pace only 20 seconds after the first byte", () => {
  expect(torrentTooSlow(flowing(15, 0))).toBe(false);
});

it("switches when the torrent brings far less than the file needs", () => {
  // 63 KiB/s on average over 30 s, as seen in the log.
  expect(torrentTooSlow(flowing(30, 63 * 1024))).toBe(true);
});

it("keeps a torrent that keeps up with the file", () => {
  expect(torrentTooSlow(flowing(30, 2 * 1024 * 1024))).toBe(false);
});

it("waits 45 seconds for a first byte: peers often hold data back at first", () => {
  // 17 October: nothing for 20 s, then 2.9 MiB/s; the rule had already given up.
  const silent = (seconds: number) => ({ ...episode, ageMs: seconds * 1000, flowingMs: null, bytesSinceFlow: 0 });
  expect(torrentTooSlow(silent(30))).toBe(false);
  expect(torrentTooSlow(silent(46))).toBe(true);
});

it("assumes a typical running time when the title has none", () => {
  const film = { fileBytes: 2 * GB, runtimeMin: undefined, type: "movie" as const, ageMs: 40_000, flowingMs: 30_000 };
  // 2 GB over 110 minutes needs about 300 KB/s: 200 KB/s is enough, 100 KB/s is not.
  expect(torrentTooSlow({ ...film, bytesSinceFlow: 200_000 * 30 })).toBe(false);
  expect(torrentTooSlow({ ...film, bytesSinceFlow: 100_000 * 30 })).toBe(true);
});

it("cannot judge the pace without the file size", () => {
  expect(torrentTooSlow({ fileBytes: null, runtimeMin: 55, type: "series", ageMs: 60_000, flowingMs: 50_000, bytesSinceFlow: 1 })).toBe(false);
});
