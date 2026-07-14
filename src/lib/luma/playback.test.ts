import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { resolveLumaPlaybackTarget } from "./playback";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
  });
});

describe("LUMA playback target resolution", () => {
  it("sends catalog references through the source picker", () => {
    const meta: Meta = { id: "tt0133093", type: "movie", name: "The Matrix" };
    expect(resolveLumaPlaybackTarget({ meta })).toMatchObject({
      ok: true,
      target: { kind: "picker", meta: { id: "tt0133093" } },
    });
  });

  it("resolves a stable local-library reference directly without persisting its path", () => {
    values.set("harbor.library.local.v1", JSON.stringify([{
      id: "local-entry-1",
      path: "/private/videos/film.mkv",
      filename: "film.mkv",
      title: "Local Film",
      year: 2026,
      type: "movie",
      addedAt: 1,
    }]));
    const resolved = resolveLumaPlaybackTarget({
      meta: { id: "local:local-entry-1", type: "movie", name: "Local Film" },
    });
    expect(resolved).toMatchObject({
      ok: true,
      target: { kind: "player", src: { url: "/private/videos/film.mkv", localLibraryEntryId: "local-entry-1" } },
    });
  });

  it("keeps a missing local item in LUMA by returning an explicit resolution error", () => {
    expect(resolveLumaPlaybackTarget({
      meta: { id: "local:missing", type: "movie", name: "Missing" },
    })).toEqual({ ok: false, message: "This local file is no longer in your library." });
  });
});
