import { describe, expect, it } from "vitest";
import type { PlayEpisode } from "@/lib/view";
import { withAbsoluteEpisodes } from "./series-absolute";

function eps(...pairs: Array<[number, number]>): PlayEpisode[] {
  return pairs.map(([season, episode]) => ({ season, episode }));
}

const absolutes = (list: PlayEpisode[]) => list.map((e) => e.absoluteEpisode);

describe("withAbsoluteEpisodes", () => {
  it("counts on from the seasons before it", () => {
    const out = withAbsoluteEpisodes(eps([1, 1], [1, 2], [2, 1], [2, 2], [3, 1]));
    expect(absolutes(out)).toEqual([undefined, undefined, 3, 4, 5]);
  });

  it("takes a season's length from its highest number, not its count", () => {
    // Episode 2 is missing from the list; season 2 must still start at 4.
    const out = withAbsoluteEpisodes(eps([1, 1], [1, 3], [2, 1]));
    expect(absolutes(out)).toEqual([undefined, undefined, 4]);
  });

  it("leaves specials out of the count and untouched", () => {
    const out = withAbsoluteEpisodes(eps([0, 1], [1, 1], [1, 2], [2, 1]));
    expect(absolutes(out)).toEqual([undefined, undefined, undefined, 3]);
  });

  it("keeps a number the source already knew", () => {
    const list: PlayEpisode[] = [
      { season: 1, episode: 1 },
      { season: 2, episode: 1, absoluteEpisode: 99 },
    ];
    expect(absolutes(withAbsoluteEpisodes(list))).toEqual([undefined, 99]);
  });

  it("is not thrown off by an unsorted list", () => {
    const out = withAbsoluteEpisodes(eps([2, 1], [1, 2], [1, 1]));
    expect(absolutes(out)).toEqual([3, undefined, undefined]);
  });

  it("returns a single season unchanged", () => {
    expect(absolutes(withAbsoluteEpisodes(eps([1, 1], [1, 2])))).toEqual([undefined, undefined]);
  });
});
