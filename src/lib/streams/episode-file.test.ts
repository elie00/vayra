import { describe, expect, it } from "vitest";
import { matchEpisodeFileIndex } from "./episode-file";

describe("matchEpisodeFileIndex", () => {
  it("matches SxxExx regardless of separator", () => {
    const names = ["Show.S02E01.1080p.mkv", "Show.S02E02.1080p.mkv", "Show.S02E03.1080p.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 2, episode: 2 })).toBe(1);
    expect(matchEpisodeFileIndex(["Show 2x03.mkv", "Show 2x04.mkv"], { season: 2, episode: 4 })).toBe(1);
  });

  it("prefers a video file over a same-numbered subtitle", () => {
    const names = ["Show.S01E05.srt", "Show.S01E05.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 5 })).toBe(1);
  });

  it("falls back to absolute numbering when no SxxExx marker exists", () => {
    const names = ["[Grp] Detective Conan - 0849 [1080p].mkv", "[Grp] Detective Conan - 0850 [1080p].mkv"];
    expect(matchEpisodeFileIndex(names, { season: 22, episode: 1, absolute: 850 })).toBe(1);
  });

  it("uses the absolute number instead of the in-season one", () => {
    const names = ["Show - 100.mkv", "Show - 101.mkv"];
    // Episode 1 of the season is absolute 101: the in-season number must not win.
    expect(matchEpisodeFileIndex(names, { season: 5, episode: 1, absolute: 101 })).toBe(1);
  });

  it("refuses an ambiguous absolute match", () => {
    const names = ["Show - 12 - part 12.mkv", "Show - 12v2.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 12, absolute: 12 })).toBe(-1);
  });

  it("does not mistake resolution, year or codec for an episode number", () => {
    const names = ["Show 2020 1080p x264 10bit.mkv", "Show - 07.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 7, absolute: 7 })).toBe(1);
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 264, absolute: 264 })).toBe(-1);
  });

  it("does not match a number embedded in a longer one", () => {
    const names = ["Show - 1043.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 4, absolute: 4 })).toBe(-1);
  });

  it("tolerates zero padding and version suffixes", () => {
    expect(matchEpisodeFileIndex(["Show - 007.mkv"], { season: 1, episode: 7, absolute: 7 })).toBe(0);
    expect(matchEpisodeFileIndex(["Show - 07v2.mkv"], { season: 1, episode: 7, absolute: 7 })).toBe(0);
  });

  it("ignores non-video files in the absolute pass", () => {
    const names = ["Show - 07.nfo", "Show - 07.mkv"];
    expect(matchEpisodeFileIndex(names, { season: 1, episode: 7, absolute: 7 })).toBe(1);
  });

  it("returns -1 without an episode hint", () => {
    expect(matchEpisodeFileIndex(["Show.S01E01.mkv"], undefined)).toBe(-1);
    expect(matchEpisodeFileIndex(["Show.S01E01.mkv"], { season: 1, episode: null })).toBe(-1);
  });
});
