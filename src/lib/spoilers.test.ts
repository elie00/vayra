import { describe, expect, it } from "vitest";
import { episodePageBlurred, spoilerMaskFor, type SpoilerSettings } from "./spoilers";

const on: SpoilerSettings = {
  hideSpoilers: true,
  spoilerHideThumbnails: true,
  spoilerHideTitles: true,
  spoilerHideDescriptions: true,
  spoilerSkipNext: false,
  blurEpisodes: true,
};

describe("episodePageBlurred", () => {
  it("hides the images of an episode not started yet", () => {
    expect(episodePageBlurred(on, { started: false })).toBe(true);
  });

  it("leaves an episode already started alone", () => {
    // Nothing left to spoil once you have watched some of it.
    expect(episodePageBlurred(on, { started: true })).toBe(false);
  });

  it("stays off when its own toggle is off", () => {
    expect(episodePageBlurred({ ...on, blurEpisodes: false }, { started: false })).toBe(false);
  });

  it("stays off when spoiler hiding is off altogether", () => {
    // The toggle lives inside "Blur spoilers" and has no meaning without it.
    expect(episodePageBlurred({ ...on, hideSpoilers: false }, { started: false })).toBe(false);
  });
});

describe("spoilerMaskFor", () => {
  it("is unaffected by the detail-page toggle", () => {
    const withIt = spoilerMaskFor(on, { watched: false, isNextUp: false });
    const without = spoilerMaskFor({ ...on, blurEpisodes: false }, { watched: false, isNextUp: false });
    expect(withIt).toEqual(without);
  });
});
