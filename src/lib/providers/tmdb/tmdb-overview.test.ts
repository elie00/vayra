import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ get: vi.fn(), language: "fr-FR" }));
vi.mock("./tmdb-client", () => ({ get: mock.get, effectiveTmdbLanguage: () => mock.language, IMG: "https://image.test" }));

describe("localized metadata overviews", () => {
  beforeEach(() => {
    vi.resetModules();
    mock.get.mockReset();
    mock.language = "fr-FR";
  });

  it("requests French descriptions for TMDB films", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    mock.get.mockResolvedValue({ overview: "  Un résumé français.  " });
    expect(await tmdbMetadataOverview("test-key", "tmdb:movie:1", "movie")).toBe("Un résumé français.");
    expect(mock.get).toHaveBeenCalledWith("test-key", "movie/1", { language: "fr-FR" });
  });

  it("resolves IMDb series instead of leaving their Cinemeta overview untranslated", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    mock.get.mockResolvedValueOnce({ movie_results: [{ id: 1 }], tv_results: [{ id: 2 }] })
      .mockResolvedValueOnce({ overview: "Résumé de la série." });
    expect(await tmdbMetadataOverview("test-key", "tt123", "series")).toBe("Résumé de la série.");
    expect(mock.get).toHaveBeenLastCalledWith("test-key", "tv/2", { language: "fr-FR" });
  });

  it("does not reuse English cache entries for French", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    mock.get.mockResolvedValueOnce({ overview: "English plot" }).mockResolvedValueOnce({ overview: "Résumé français" });
    mock.language = "en-US";
    expect(await tmdbMetadataOverview("test-key", "tmdb:tv:3")).toBe("English plot");
    mock.language = "fr-FR";
    expect(await tmdbMetadataOverview("test-key", "tmdb:tv:3")).toBe("Résumé français");
    expect(await tmdbMetadataOverview("test-key", "tmdb:tv:3")).toBe("Résumé français");
    expect(mock.get).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous preview requests", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    let finish!: (data: { overview: string }) => void;
    mock.get.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = tmdbMetadataOverview("test-key", "tmdb:movie:1");
    const second = tmdbMetadataOverview("test-key", "tmdb:movie:1");
    finish({ overview: "Résumé" });
    expect(await Promise.all([first, second])).toEqual(["Résumé", "Résumé"]);
    expect(mock.get).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a network or authentication failure", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    mock.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ overview: "Résumé" });
    expect(await tmdbMetadataOverview("test-key", "tmdb:movie:1")).toBeUndefined();
    expect(await tmdbMetadataOverview("test-key", "tmdb:movie:1")).toBe("Résumé");
  });

  it("does not invent a translation when the provider has none", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    mock.get.mockResolvedValue({ overview: " " });
    expect(await tmdbMetadataOverview("test-key", "tmdb:movie:1")).toBeUndefined();
  });

  it("keeps the requested language across a slow IMDb lookup", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    let finish!: (data: { tv_results: { id: number }[] }) => void;
    mock.get.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ overview: "Résumé" });
    const request = tmdbMetadataOverview("test-key", "tt123", "series");
    mock.language = "en-US";
    finish({ tv_results: [{ id: 5 }] });
    await request;
    expect(mock.get).toHaveBeenLastCalledWith("test-key", "tv/5", { language: "fr-FR" });
  });

  it("skips unsupported IDs and missing keys without making network requests", async () => {
    const { tmdbMetadataOverview } = await import("./tmdb-lite");
    expect(await tmdbMetadataOverview("", "tmdb:movie:1")).toBeUndefined();
    expect(await tmdbMetadataOverview("test-key", "some-addon:1")).toBeUndefined();
    expect(mock.get).not.toHaveBeenCalled();
  });
});
