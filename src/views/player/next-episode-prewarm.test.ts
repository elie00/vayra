import { expect, it } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import type { PlayerStreamRef } from "@/lib/view";
import { prewarmDue, torrentToPrewarm } from "./next-episode-prewarm";

const torrent = (hash: string, extra: Record<string, unknown> = {}) =>
  ({ infoHash: hash, url: undefined, cached: {}, addonId: "torrentio", resolution: "1080p", source: "WEB-DL", releaseGroup: "NTb", ...extra }) as unknown as ScoredStream;

// Episode 3 plays from Torrentio, 1080p WEB-DL by NTb.
const playing: PlayerStreamRef = { infoHash: "e03", addonId: "torrentio", resolution: "1080p", source: "WEB-DL", releaseGroup: "NTb" };

it("prepares the next episode from the source this one plays from", () => {
  const other = torrent("x", { resolution: "2160p" });
  const otherGroup = torrent("y", { releaseGroup: "FLUX" });
  const same = torrent("e04");
  expect(torrentToPrewarm([other, otherGroup, same], playing)).toBe(same);
});

it("takes another release of the same kind when the group has none", () => {
  const otherGroup = torrent("y", { releaseGroup: "FLUX" });
  expect(torrentToPrewarm([torrent("x", { resolution: "2160p" }), otherGroup], playing)).toBe(otherGroup);
});

it("follows the add-on's binge group when both carry one", () => {
  const binge = { ...playing, bingeGroup: "torrentio|1080p|NTb" };
  const sameBinge = torrent("z", { resolution: "720p", behaviorHints: { bingeGroup: "torrentio|1080p|NTb" } });
  expect(torrentToPrewarm([torrent("e04", { behaviorHints: { bingeGroup: "other" } }), sameBinge], binge)).toBe(sameBinge);
});

it("prepares nothing rather than a source picked at random", () => {
  expect(torrentToPrewarm([torrent("x", { resolution: "2160p" }), torrent("w", { addonId: "comet" })], playing)).toBeNull();
  expect(torrentToPrewarm([torrent("e04")], undefined)).toBeNull();
});

it("leaves a season pack, cached or direct sources alone", () => {
  expect(torrentToPrewarm([torrent("E03")], playing)).toBeNull();
  expect(torrentToPrewarm([torrent("e04", { cached: { rd: true } })], playing)).toBeNull();
  expect(torrentToPrewarm([torrent("e04", { url: "https://cdn.example.invalid/e04.mkv" })], playing)).toBeNull();
});

it("starts halfway through an episode, not before its length is known", () => {
  expect(prewarmDue(1500, 3000)).toBe(true);
  expect(prewarmDue(1400, 3000)).toBe(false);
  expect(prewarmDue(10, 0)).toBe(false);
});
