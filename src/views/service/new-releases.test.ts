import { beforeEach, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-fetch", () => ({ safeFetch }));

import { fetchNewReleases, newReleasesParams } from "./new-releases";

const now = new Date("2026-10-17T09:00:00Z");

it("asks for films released and episodes aired in the last 60 days, most popular first", () => {
  const movie = newReleasesParams("movie", "k", "8", "FR", now);
  expect(movie.get("primary_release_date.gte")).toBe("2026-08-18");
  expect(movie.get("primary_release_date.lte")).toBe("2026-10-17");
  expect(movie.get("with_watch_providers")).toBe("8");
  expect(movie.get("watch_region")).toBe("FR");
  expect(movie.get("sort_by")).toBe("popularity.desc");
  const tv = newReleasesParams("tv", "k", "8", "FR", now);
  expect(tv.get("air_date.gte")).toBe("2026-08-18");
  expect(tv.get("air_date.lte")).toBe("2026-10-17");
  expect(tv.has("primary_release_date.gte")).toBe(false);
});

beforeEach(() => {
  safeFetch.mockReset().mockImplementation(async (url: string) => {
    const results = url.includes("/discover/movie")
      ? [
          { id: 1, title: "Film A", poster_path: "/a.jpg", release_date: "2026-10-01", popularity: 50 },
          { id: 2, title: "Sans affiche", poster_path: null, release_date: "2026-10-02", popularity: 90 },
        ]
      : [{ id: 3, name: "Série B", poster_path: "/b.jpg", first_air_date: "2024-01-01", popularity: 80 }];
    return { ok: true, json: async () => ({ results }) };
  });
});

it("merges films and series by popularity, without titles lacking a poster", async () => {
  const metas = await fetchNewReleases("k", "8", "FR", now);
  expect(metas.map((m) => [m.id, m.type])).toEqual([
    ["tmdb:tv:3", "series"],
    ["tmdb:movie:1", "movie"],
  ]);
});

it("returns nothing without a TMDB key", async () => {
  expect(await fetchNewReleases("", "8", "FR", now)).toEqual([]);
  expect(safeFetch).not.toHaveBeenCalled();
});
