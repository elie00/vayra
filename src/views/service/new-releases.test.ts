import { beforeEach, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-fetch", () => ({ safeFetch }));

import { fetchNewReleases, justWatchMetas, newReleasesParams } from "./new-releases";

const now = new Date("2026-10-17T09:00:00Z");
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });

const movie = (tmdbId: string | null, title: string, poster: string | null = "/poster/1/{profile}/x.{format}") => ({
  node: { __typename: "Movie", content: { title, posterUrl: poster, originalReleaseYear: 2011, externalIds: { tmdbId } } },
});
const season = (tmdbId: string, title: string, number: number) => ({
  node: {
    __typename: "Season",
    content: { seasonNumber: number },
    show: { content: { title, posterUrl: "/poster/2/{profile}/s.{format}", originalReleaseYear: 2023, externalIds: { tmdbId } } },
  },
});

it("turns JustWatch arrivals into cards: films, and a show for each new season", () => {
  const metas = justWatchMetas([
    season("203857", "La Diplomate", 4),
    movie("77338", "Intouchables"),
    movie(null, "Sans identifiant TMDB"),
    movie("1", "Sans affiche", null),
    season("203857", "La Diplomate", 3),
  ]);
  expect(metas.map((m) => [m.id, m.type, m.name, m.releaseInfo])).toEqual([
    ["tmdb:tv:203857", "series", "La Diplomate", "2023"],
    ["tmdb:movie:77338", "movie", "Intouchables", "2011"],
  ]);
  expect(metas[1].poster).toBe("https://images.justwatch.com/poster/1/s332/x.webp");
});

it("asks TMDB for films released and series started in the last 60 days, most popular first", () => {
  const films = newReleasesParams("movie", "k", "8", "FR", now);
  expect(films.get("primary_release_date.gte")).toBe("2026-08-18");
  expect(films.get("primary_release_date.lte")).toBe("2026-10-17");
  expect(films.get("with_watch_providers")).toBe("8");
  expect(films.get("watch_region")).toBe("FR");
  expect(films.get("sort_by")).toBe("popularity.desc");
  // Episodes aired lately would bring back daily shows running for decades.
  const series = newReleasesParams("tv", "k", "8", "FR", now);
  expect(series.get("first_air_date.gte")).toBe("2026-08-18");
  expect(series.has("air_date.gte")).toBe(false);
});

const packages = { data: { packages: [{ shortName: "nfx", packageId: 8 }, { shortName: "prv", packageId: 119 }] } };

function tmdb(url: string) {
  const results = url.includes("/discover/movie")
    ? [
        { id: 1, title: "Film A", poster_path: "/a.jpg", release_date: "2026-10-01", popularity: 50 },
        { id: 2, title: "Sans affiche", poster_path: null, popularity: 90 },
      ]
    : [{ id: 3, name: "Série B", poster_path: "/b.jpg", first_air_date: "2026-09-01", popularity: 80 }];
  return json({ results });
}

beforeEach(() => {
  safeFetch.mockReset();
});

it("lists what reached the service on JustWatch, newest day first", async () => {
  const days: string[] = [];
  safeFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!url.includes("justwatch")) return tmdb(url);
    const body = JSON.parse(String(init?.body));
    if (body.query.includes("packages")) return json(packages);
    days.push(body.variables.date);
    expect(body.variables.filter.packages).toEqual(["nfx"]);
    expect(body.variables.country).toBe("FR");
    const edges = body.variables.date === "2026-10-17" ? [movie("77338", "Intouchables")] : body.variables.date === "2026-10-16" ? [season("203857", "La Diplomate", 4)] : [];
    return json({ data: { newTitles: { edges } } });
  });
  const metas = await fetchNewReleases("k", "8", "FR", "fr", now);
  expect(metas.map((m) => m.id)).toEqual(["tmdb:movie:77338", "tmdb:tv:203857"]);
  expect(days).toHaveLength(14);
  expect(days).toContain("2026-10-04");
});

it("falls back to TMDB releases when JustWatch does not answer", async () => {
  safeFetch.mockImplementation(async (url: string) => (url.includes("justwatch") ? json({ errors: [{ message: "down" }] }) : tmdb(url)));
  const metas = await fetchNewReleases("k", "8", "DE", "fr", now);
  expect(metas.map((m) => [m.id, m.type])).toEqual([
    ["tmdb:tv:3", "series"],
    ["tmdb:movie:1", "movie"],
  ]);
});

it("needs no TMDB key for JustWatch, and fetches nothing without either", async () => {
  safeFetch.mockImplementation(async () => json({ errors: [{ message: "down" }] }));
  expect(await fetchNewReleases("", "8", "IT", "fr", now)).toEqual([]);
  expect(safeFetch.mock.calls.every(([url]) => String(url).includes("justwatch"))).toBe(true);
});
