import { describe, expect, it } from "vitest";
import type { LumaResumeEntry } from "@/lib/luma/types";
import type { LibraryItem } from "@/lib/stremio";
import { connectResumes, lumaResumesFromMac } from "./history";

const luma = (ref: LumaResumeEntry["ref"]): LumaResumeEntry => ({
  id: "r1",
  ref,
  presentation: { title: "Breaking Bad", episodeTitle: "Breakage", artwork: "https://img.example/bb.jpg" },
  positionMs: 600_000,
  durationMs: 2_820_000,
  updatedAt: 1_793_500_000_000,
});

const stremio = (patch: Partial<LibraryItem>): LibraryItem => ({
  _id: "tt1375666",
  type: "movie",
  name: "Inception",
  poster: "https://img.example/inception.jpg",
  state: { timeOffset: 60_000, duration: 8_880_000, lastWatched: "2026-10-31T20:00:00.000Z" },
  removed: false,
  temp: false,
  _ctime: "2026-10-01T00:00:00.000Z",
  _mtime: "2026-10-31T20:00:00.000Z",
  ...patch,
});

describe("the Mac's Continue Watching over VAYRA Connect", () => {
  it("carries LUMA and Stremio resume points, and leaves files only this Mac has", () => {
    const resumes = connectResumes([
      { kind: "local", at: 2, entry: luma({ kind: "catalog", metaId: "tt0903747", mediaType: "series", episode: { season: 2, episode: 5, canonicalVideoId: "tt0903747:2:5" } }) },
      { kind: "local", at: 1, entry: luma({ kind: "local-library", entryId: "file-1", mediaType: "movie" }) },
      { kind: "connected", at: 0, item: stremio({}) },
      { kind: "connected", at: 0, item: stremio({ _id: "local:abc", local: true }) },
    ]);
    expect(resumes).toEqual([
      {
        metaId: "tt0903747", mediaType: "series", season: 2, episode: 5, videoId: "tt0903747:2:5",
        title: "Breaking Bad", episodeTitle: "Breakage", artwork: "https://img.example/bb.jpg",
        positionMs: 600_000, durationMs: 2_820_000, updatedAt: 1_793_500_000_000,
      },
      {
        metaId: "tt1375666", mediaType: "movie", title: "Inception", artwork: "https://img.example/inception.jpg",
        positionMs: 60_000, durationMs: 8_880_000, updatedAt: Date.parse("2026-10-31T20:00:00.000Z"),
      },
    ]);
  });

  it("reads the episode of a Stremio series from its video id, but not a three-part anime id", () => {
    const [series, anime] = connectResumes([
      { kind: "connected", at: 0, item: stremio({ _id: "tt0903747", type: "series", name: "Breaking Bad", state: { timeOffset: 1, duration: 2, video_id: "tt0903747:3:1" } }) },
      { kind: "connected", at: 0, item: stremio({ _id: "kitsu:1376", type: "series", name: "Death Note", state: { timeOffset: 1, duration: 2, video_id: "kitsu:1376:7" } }) },
    ]);
    expect(series).toMatchObject({ season: 3, episode: 1, videoId: "tt0903747:3:1" });
    expect(anime).not.toHaveProperty("season");
    expect(anime).toMatchObject({ videoId: "kitsu:1376:7" });
  });

  it("turns them back into resume points this phone's LUMA keeps", () => {
    const [entry] = lumaResumesFromMac([
      { metaId: "tt0903747", mediaType: "series", season: 2, episode: 5, videoId: "tt0903747:2:5", title: "Breaking Bad", positionMs: 1, durationMs: 2, updatedAt: 3 },
    ]);
    expect(entry).toEqual({
      ref: { kind: "catalog", metaId: "tt0903747", mediaType: "series", episode: { season: 2, episode: 5, canonicalVideoId: "tt0903747:2:5" } },
      presentation: { title: "Breaking Bad" },
      positionMs: 1,
      durationMs: 2,
      updatedAt: 3,
    });
  });
});
