import { describe, expect, it } from "vitest";
import { planExport } from "./watchlist-sync";

describe("planExport", () => {
  it("sorts titles into movies and shows", () => {
    const plan = planExport([
      { id: "tt0111161", type: "movie" },
      { id: "tt0903747", type: "series" },
    ]);
    expect(plan.movies).toEqual([{ ids: { imdb: "tt0111161" } }]);
    expect(plan.shows).toEqual([{ ids: { imdb: "tt0903747" } }]);
    expect(plan.total).toBe(2);
  });

  it("reads a TMDB id", () => {
    const plan = planExport([{ id: "tmdb:movie:550", type: "movie" }]);
    expect(plan.movies).toEqual([{ ids: { tmdb: 550 } }]);
  });

  it("counts anime as skipped rather than sending it", () => {
    const plan = planExport([
      { id: "kitsu:1", type: "series" },
      { id: "mal:2", type: "series" },
      { id: "tt0111161", type: "movie" },
    ]);
    expect(plan.skippedAnime).toBe(2);
    expect(plan.shows).toEqual([]);
    expect(plan.total).toBe(3);
  });

  it("leaves out entries the library has dropped or is holding", () => {
    const plan = planExport([
      { id: "tt1", type: "movie", removed: true },
      { id: "tt2", type: "movie", temp: true },
      { id: "", type: "movie" },
    ]);
    expect(plan.total).toBe(0);
    expect(plan.movies).toEqual([]);
  });

  it("sends a title once even when both sources have it", () => {
    const plan = planExport([
      { id: "tt0111161", type: "movie" },
      { id: "tt0111161", type: "movie" },
    ]);
    expect(plan.movies).toHaveLength(1);
    expect(plan.total).toBe(1);
  });

  it("counts an id Trakt cannot match, without sending it", () => {
    const plan = planExport([{ id: "local-abc123", type: "movie" }]);
    expect(plan.total).toBe(1);
    expect(plan.movies).toEqual([]);
    expect(plan.shows).toEqual([]);
  });

  it("treats channels as shows", () => {
    const plan = planExport([{ id: "tt0903747", type: "channel" }]);
    expect(plan.shows).toHaveLength(1);
  });

  it("reads the kind from the id when the entry does not say", () => {
    // Watchlist rows have an optional type; a TMDB id already carries the kind.
    const plan = planExport([{ id: "tmdb:tv:1396" }, { id: "tmdb:movie:550" }]);
    expect(plan.shows).toEqual([{ ids: { tmdb: 1396 } }]);
    expect(plan.movies).toEqual([{ ids: { tmdb: 550 } }]);
  });
})
