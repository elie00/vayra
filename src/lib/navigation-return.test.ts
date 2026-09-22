import { expect, it } from "vitest";
import type { Frame } from "./view";
import { playbackReturnStack } from "./navigation-return";
const meta = { id: "tt123", type: "series" as const, name: "Series" };
it("returns to the same detail object and episode hint after playback", () => {
  const detail: Frame = { kind: "meta", meta, episodeHint: { season: 2, episode: 4 } };
  const origin: Frame[] = [{ kind: "home" }, detail];
  const stack: Frame[] = [...origin, { kind: "picker", meta }, { kind: "player", src: { meta, url: "movie.mkv", title: meta.name } }];
  const returned = playbackReturnStack(stack);
  expect(returned).toEqual(origin);
  expect(returned[1]).toBe(detail);
  expect(stack).toHaveLength(4);
});
it("returns direct offline playback to its original downloads page", () => {
  expect(playbackReturnStack([{ kind: "downloads" }, { kind: "player", src: { meta, url: "movie.mkv", title: meta.name } }])).toEqual([{ kind: "downloads" }]);
});
it("is safe when closing twice and never removes the root", () => {
  expect(playbackReturnStack([{ kind: "home" }])).toEqual([{ kind: "home" }]);
});
