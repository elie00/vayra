import { beforeEach, expect, it, vi } from "vitest";
import { searchAll, searchAnime, searchCinemeta } from "./search";
import { searchAddonCatalogs, searchAddonGroups } from "./search-addons";
import { safeFetch } from "./safe-fetch";
import { get } from "./providers/tmdb/tmdb-client";
import { anilistRequest } from "./anilist/client";
import type { Addon } from "./addons";

vi.mock("./safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./providers/tmdb/tmdb-client", () => ({ get: vi.fn() }));
vi.mock("./anilist/client", () => ({ anilistRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); });

it("reports a swallowed TMDB failure instead of a successful empty response", async () => {
  const diagnostics = { failed: false };
  vi.mocked(get).mockResolvedValue(null);
  await searchAll("fixture-only", "Fixture", { diagnostics });
  expect(diagnostics.failed).toBe(true);
});

it("keeps empty Cinemeta success distinct from HTTP failure and malformed JSON", async () => {
  const success = { failed: false };
  vi.mocked(safeFetch).mockImplementation(async () => new Response(JSON.stringify({ metas: [] })));
  await expect(searchCinemeta("Fixture", success)).resolves.toEqual({ movies: [], series: [] });
  expect(success.failed).toBe(false);
  for (const response of [() => new Response("", { status: 503 }), () => new Response("broken-json")]) {
    const failure = { failed: false };
    vi.mocked(safeFetch).mockImplementation(async () => response());
    await expect(searchCinemeta("Fixture", failure)).resolves.toEqual({ movies: [], series: [] });
    expect(failure.failed).toBe(true);
  }
});

it("reports AniList and Jikan failure through the real aggregate adapters", async () => {
  const diagnostics = { failed: false };
  vi.mocked(anilistRequest).mockRejectedValue(new Error("Fixture offline"));
  vi.mocked(safeFetch).mockResolvedValue(new Response("", { status: 503 }));
  await expect(searchAnime("Fixture", 8, diagnostics)).resolves.toEqual([]);
  expect(diagnostics.failed).toBe(true);
});

it("preserves results when only one Cinemeta type fails", async () => {
  const diagnostics = { failed: false };
  vi.mocked(safeFetch).mockImplementation(async (url) => String(url).includes("/series/") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ metas: [{ id: "fixture", name: "Fixture", type: "movie" }] })));
  const result = await searchCinemeta("Fixture", diagnostics);
  expect(result.movies).toHaveLength(1);
  expect(diagnostics.failed).toBe(true);
});

it.each([searchAddonCatalogs, searchAddonGroups])("reports addon HTTP failure without losing other successful catalogs", async (search) => {
  const addon: Addon = { transportUrl: "https://fixture.invalid/manifest.json", manifest: { id: "fixture", name: "Fixture", catalogs: [{ id: "good", name: "Good", type: "movie", extra: [{ name: "search" }] }, { id: "bad", name: "Bad", type: "movie", extra: [{ name: "search" }] }] } };
  const diagnostics = { failed: false };
  vi.mocked(safeFetch).mockImplementation(async (url) => String(url).includes("/bad/") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ metas: [{ id: "fixture-film", name: "Fixture", type: "movie" }] })));
  const result = await search([addon], "Fixture", diagnostics);
  expect(diagnostics.failed).toBe(true);
  expect(JSON.stringify(result)).toContain("fixture-film");
});
