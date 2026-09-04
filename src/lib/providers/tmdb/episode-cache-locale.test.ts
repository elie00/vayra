import { beforeEach, expect, it, vi } from "vitest";
import { cacheEpisode, clearEpisodeCache, getCachedEpisode } from "./tmdb-episode-cache";
import type { EpisodeDetail } from "./tmdb-episode-types";

vi.mock("./tmdb-client", () => ({ effectiveTmdbLanguage: () => "fr-FR" }));
beforeEach(clearEpisodeCache);

const episode: EpisodeDetail = {
  id: 1, episodeNumber: 1, seasonNumber: 1, name: "Pilot", overview: "English summary",
  stillPath: null, airDate: null, runtime: null, voteAverage: null, voteCount: 0,
  imdbId: null, guestStars: [], crew: [], stills: [],
};

it("never serves an English cached description for the French locale", () => {
  cacheEpisode("123", 1, 1, episode, "en");
  expect(getCachedEpisode("123", 1, 1)).toBeNull();
  const french = { ...episode, overview: "Résumé français" };
  cacheEpisode("123", 1, 1, french);
  expect(getCachedEpisode("123", 1, 1)?.overview).toBe("Résumé français");
  expect(getCachedEpisode("123", 1, 1, "en")?.overview).toBe("English summary");
});
