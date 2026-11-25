import { describe, expect, it, vi } from "vitest";
import {
  cleanCollectionTitle,
  computeCollectionYearRange,
  pickBestCollectionBackdrop,
  pickCollectionPosterStack,
  tmdbCollection,
  tmdbCollectionImages,
} from "./tmdb-collection";
import * as tmdbClient from "./tmdb-client";

describe("tmdb-collection helpers", () => {
  it("cleans redundant TMDB collection and saga suffixes cleanly", () => {
    expect(cleanCollectionTitle("Star Wars Collection")).toBe("Star Wars");
    expect(cleanCollectionTitle("Le Seigneur des anneaux - Saga")).toBe("Le Seigneur des anneaux");
    expect(cleanCollectionTitle("Harry Potter - Collection")).toBe("Harry Potter");
    expect(cleanCollectionTitle("Dune (Collection)")).toBe("Dune");
    expect(cleanCollectionTitle("The Twilight Saga")).toBe("The Twilight Saga");
    expect(cleanCollectionTitle("The Dark Knight Trilogy")).toBe("The Dark Knight Trilogy");
  });

  it("prefers textless widescreen backdrops over localized cluttered ones", () => {
    const picked = pickBestCollectionBackdrop([
      { file_path: "/en-text.jpg", iso_639_1: "en", vote_average: 9.5, vote_count: 50, width: 1920, aspect_ratio: 1.77 },
      { file_path: "/clean.jpg", iso_639_1: null, vote_average: 7.2, vote_count: 18, width: 1920, aspect_ratio: 1.77 },
    ]);
    expect(picked).toBe("/clean.jpg");
  });

  it("spans opening, middle and latest released posters in the collector stack", () => {
    const parts = [
      { id: "tmdb:movie:1", type: "movie" as const, name: "Part 1", poster: "/p1.jpg", releaseDate: "2001-01-01" },
      { id: "tmdb:movie:2", type: "movie" as const, name: "Part 2", poster: "/p2.jpg", releaseDate: "2002-01-01" },
      { id: "tmdb:movie:3", type: "movie" as const, name: "Part 3", poster: "/p3.jpg", releaseDate: "2003-01-01" },
      { id: "tmdb:movie:4", type: "movie" as const, name: "Part 4", poster: "/p4.jpg", releaseDate: "2004-01-01" },
      { id: "tmdb:movie:5", type: "movie" as const, name: "Part 5", poster: "/p5.jpg", releaseDate: "2005-01-01" },
    ];
    expect(pickCollectionPosterStack(parts)).toEqual(["/p1.jpg", "/p3.jpg", "/p5.jpg"]);
    expect(computeCollectionYearRange(parts.map((p, idx) => ({ ...p, releaseInfo: String(2001 + idx) })))).toBe(
      "2001–2005",
    );
  });

  it("falls back to best part backdrop and computes display metadata", async () => {
    const spy = vi.spyOn(tmdbClient, "get").mockImplementation(async (_key, path) => {
      if (path === "collection/999001") {
        return {
          id: 999001,
          name: "Le Seigneur des anneaux - Saga",
          overview: "La quête de l'Anneau.",
          poster_path: "/col-poster.jpg",
          backdrop_path: null,
          parts: [
            {
              id: 120,
              title: "La Communauté de l'anneau",
              poster_path: "/lotr1.jpg",
              backdrop_path: "/lotr1-bg.jpg",
              release_date: "2001-12-19",
              vote_average: 8.4,
              vote_count: 25000,
              genre_ids: [12, 14],
            },
            {
              id: 122,
              title: "Le Retour du roi",
              poster_path: "/lotr3.jpg",
              backdrop_path: "/lotr3-bg.jpg",
              release_date: "2003-12-17",
              vote_average: 8.5,
              vote_count: 24000,
              genre_ids: [12, 14],
            },
          ],
        };
      }
      if (path === "collection/999001/images") {
        return {
          backdrops: [
            { file_path: "/clean-art.jpg", iso_639_1: null, vote_average: 8.1, vote_count: 15, width: 1920, aspect_ratio: 1.78 },
          ],
          posters: [],
        };
      }
      return null;
    });

    const col = await tmdbCollection("test-key", 999001);
    expect(col).not.toBeNull();
    expect(col?.displayName).toBe("Le Seigneur des anneaux");
    expect(col?.cardBackdrop).toContain("/w780/lotr");
    expect(col?.backdrop).toContain("/w1280/lotr");
    expect(col?.posterStack).toHaveLength(2);
    expect(col?.yearRange).toBe("2001–2003");
    expect(col?.averageRating).toBe("8.5");
    expect(col?.releasedCount).toBe(2);

    const art = await tmdbCollectionImages("test-key", 999001);
    expect(art?.cardBackdrop).toBe("https://image.tmdb.org/t/p/w780/clean-art.jpg");
    expect(art?.heroBackdrop).toBe("https://image.tmdb.org/t/p/w1280/clean-art.jpg");
    spy.mockRestore();
  });
});
