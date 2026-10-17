import { expect, it } from "vitest";
import { torrentTooSlow } from "./slow-torrent";

const GB = 1e9;
// The Diplomat S04E03 in 2160p: 8.3 GB for a 55-minute episode needs about 2.5 MB/s.
const episode = { fileBytes: 8.3 * GB, runtimeMin: 55, type: "series" as const };

it("gives a torrent 20 seconds before judging it", () => {
  expect(torrentTooSlow({ ...episode, ageMs: 15_000, bytesSinceStart: 0 })).toBe(false);
});

it("switches when the torrent brings far less than the file needs", () => {
  // 63 KiB/s on average over 30 s, as seen in the log.
  expect(torrentTooSlow({ ...episode, ageMs: 30_000, bytesSinceStart: 63 * 1024 * 30 })).toBe(true);
});

it("keeps a torrent that keeps up with the file", () => {
  expect(torrentTooSlow({ ...episode, ageMs: 30_000, bytesSinceStart: 2 * 1024 * 1024 * 30 })).toBe(false);
});

it("assumes a typical running time when the title has none", () => {
  const film = { fileBytes: 2 * GB, runtimeMin: undefined, type: "movie" as const };
  // 2 GB over 110 minutes needs about 300 KB/s: 200 KB/s is enough, 100 KB/s is not.
  expect(torrentTooSlow({ ...film, ageMs: 30_000, bytesSinceStart: 200_000 * 30 })).toBe(false);
  expect(torrentTooSlow({ ...film, ageMs: 30_000, bytesSinceStart: 100_000 * 30 })).toBe(true);
});

it("cannot judge without the file size", () => {
  expect(torrentTooSlow({ fileBytes: null, runtimeMin: 55, type: "series", ageMs: 60_000, bytesSinceStart: 0 })).toBe(false);
});
