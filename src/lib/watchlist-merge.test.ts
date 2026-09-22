import { describe, expect, it } from "vitest";
import { filterLibrary, mergeWatchlist } from "./watchlist-merge";
import type { LibraryItem } from "./stremio";

const saved = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  _id: id, type: "movie", name: id, removed: false, temp: false,
  _ctime: "2026-09-01", _mtime: "2026-09-02", ...extra,
});

describe("shared home and library watchlist", () => {
  it("includes the canonical local entries even without connected services", () => {
    const entries = mergeWatchlist([{ id: "tt1", type: "series", name: "Reacher", addedAt: 123 }], [], []);
    expect(entries).toEqual([{ key: "tt1", meta: { id: "tt1", type: "series", name: "Reacher", poster: undefined }, date: 123 }]);
  });
  it("combines local, Stremio and Trakt entries without repeating titles", () => {
    const entries = mergeWatchlist([
      { id: "tt1", type: "movie", name: "First", addedAt: 123 },
      { id: "tt3", type: "movie", name: "Third", addedAt: 456 },
    ], [saved("tt1", { name: "First" })], [
      { type: "movie", title: "First", year: 2026, ids: { imdb: "tt1" } },
      { type: "show", title: "Second", year: 2026, ids: { imdb: "tt2" } },
    ]);
    expect(entries.map((entry) => entry.meta.id)).toEqual(["tt1", "tt2", "tt3"]);
    expect(entries[0].stremioId).toBe("tt1");
  });
  it("uses the same watched, in-progress, removed and bookmark filters", () => {
    const items = [saved("saved"), saved("removed", { removed: true }),
      saved("watched", { state: { flaggedWatched: 1, timeOffset: 0, duration: 100 } }),
      saved("progress", { state: { timeOffset: 10, duration: 100 } }), saved("temporary", { temp: true })];
    expect(filterLibrary(items, true).map((item) => item._id)).toEqual(["saved"]);
    expect(filterLibrary(items, false).map((item) => item._id)).toEqual(["saved", "temporary"]);
  });
});
