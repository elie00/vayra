import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ overview: vi.fn(), kitsu: vi.fn(), imdb: vi.fn() }));
vi.mock("./providers/tmdb/tmdb-lite", () => ({ tmdbMetadataOverview: mock.overview }));
vi.mock("./providers/anime-mapping", () => ({ externalToKitsu: mock.kitsu, kitsuToImdb: mock.imdb }));
import { localizedMetadataOverview } from "./metadata-overview";

describe("anime description localization", () => {
  beforeEach(() => vi.resetAllMocks());
  it("uses stable Kitsu/IMDb mappings for a French anime synopsis", async () => {
    mock.imdb.mockResolvedValue("tt456");
    mock.overview.mockResolvedValue("Un jeune héros part à l’aventure.");
    expect(await localizedMetadataOverview("key", { id: "kitsu:12", type: "series", name: "Anime" }, "fr-FR"))
      .toBe("Un jeune héros part à l’aventure.");
    expect(mock.overview).toHaveBeenCalledWith("key", "tt456", "series", "fr-FR");
  });
  it("resolves MyAnimeList entries without guessing by title", async () => {
    mock.kitsu.mockResolvedValue(12);
    mock.imdb.mockResolvedValue("tt456");
    await localizedMetadataOverview("key", { id: "mal:42", type: "movie", name: "Anime" }, "fr-FR");
    expect(mock.kitsu).toHaveBeenCalledWith("myanimelist", 42);
    expect(mock.overview).toHaveBeenCalledWith("key", "tt456", "movie", "fr-FR");
  });
  it("leaves unmapped content untouched", async () => {
    mock.imdb.mockResolvedValue(null);
    expect(await localizedMetadataOverview("key", { id: "kitsu:12", type: "series", name: "Anime" }, "fr-FR"))
      .toBeUndefined();
    expect(mock.overview).not.toHaveBeenCalled();
  });
});
