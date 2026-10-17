import { expect, it } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import { torrentsToPrewarm, nearEnd } from "./next-episode-prewarm";

const torrent = (hash: string, extra: Record<string, unknown> = {}) =>
  ({ infoHash: hash, url: undefined, cached: {}, ...extra }) as unknown as ScoredStream;

it("warms the first torrents the engine would download itself", () => {
  const list = [
    torrent("A", { cached: { rd: true } }),
    torrent("b", { url: "https://cdn.example.invalid/e02.mkv" }),
    torrent("C"),
    torrent("c"),
    torrent("D"),
    torrent("E"),
  ];
  expect(torrentsToPrewarm(list)).toEqual([list[2], list[4]]);
});

it("starts near the end of an episode, not before its length is known", () => {
  expect(nearEnd(2700, 3000)).toBe(true);
  expect(nearEnd(2400, 3000)).toBe(false);
  expect(nearEnd(10, 0)).toBe(false);
});
