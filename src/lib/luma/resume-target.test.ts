import { describe, expect, it } from "vitest";
import type { LocalEntry } from "@/lib/local-library";
import type { LumaResumeEntry } from "./types";
import { resolveLumaResumeTarget } from "./resume-target";

const catalogResume: LumaResumeEntry = {
  id: "resume-1",
  ref: {
    kind: "catalog",
    metaId: "tt123",
    mediaType: "series",
    episode: { season: 2, episode: 3, canonicalVideoId: "tt123:2:3" },
  },
  presentation: { title: "North Line", episodeTitle: "Signal" },
  positionMs: 1_000,
  durationMs: 10_000,
  updatedAt: 50,
};

describe("LUMA resume target", () => {
  it("maps catalog activity to the picker without exposing a source", () => {
    expect(resolveLumaResumeTarget(catalogResume, [])).toEqual({
      kind: "catalog",
      meta: {
        id: "tt123",
        type: "series",
        name: "North Line",
        poster: undefined,
        background: undefined,
      },
      episode: { season: 2, episode: 3, videoId: "tt123:2:3", name: "Signal" },
    });
  });

  it("detects a local file removed since the activity was recorded", () => {
    const entry: LumaResumeEntry = {
      ...catalogResume,
      ref: { kind: "local-library", entryId: "gone", mediaType: "movie" },
    };
    expect(resolveLumaResumeTarget(entry, [])).toEqual({ kind: "missing-local", entryId: "gone" });
  });

  it("resolves an existing local entry to a player target", () => {
    const entry: LumaResumeEntry = {
      ...catalogResume,
      ref: { kind: "local-library", entryId: "local-1", mediaType: "movie" },
    };
    const local: LocalEntry = {
      id: "local-1",
      path: "/media/north-line.mkv",
      filename: "north-line.mkv",
      title: "North Line",
      year: 2026,
      type: "movie",
      addedAt: 1,
    };
    const target = resolveLumaResumeTarget(entry, [local]);
    expect(target.kind).toBe("local");
    if (target.kind === "local") expect(target.player.url).toBe(local.path);
  });
});
