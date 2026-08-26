import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  manualWatchedState: vi.fn(),
  readResumeEntry: vi.fn(),
  lastPlayedEpisode: vi.fn(),
}));

vi.mock("@/lib/manual-watched", () => ({ manualWatchedState: mocks.manualWatchedState }));
vi.mock("@/lib/resume", () => ({
  readResumeEntry: mocks.readResumeEntry,
  lastPlayedEpisode: mocks.lastPlayedEpisode,
}));
vi.mock("@/lib/i18n", () => ({ t: (k: string) => k }));

import { getEpisodeProgress, resumeDefaultSeason } from "./episode-progress";

const NONE = new Set<string>();

const progress = () => getEpisodeProgress("tt1", 1, 2, 45, null, NONE);

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.manualWatchedState.mockReturnValue(undefined);
  mocks.readResumeEntry.mockReturnValue(null);
  mocks.lastPlayedEpisode.mockReturnValue(null);
});

describe("getEpisodeProgress", () => {
  it("reports nothing for an episode never touched", () => {
    expect(progress()).toEqual({ ratio: 0, watched: false, startedAt: 0 });
  });

  it("takes any service saying watched", () => {
    const seen = new Set(["1:2"]);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, seen).watched).toBe(true);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, NONE, seen).watched).toBe(true);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, NONE, NONE, seen).watched).toBe(true);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, NONE, NONE, NONE, seen).watched).toBe(true);
  });

  it("matches Trakt on its own key shape", () => {
    const trakt = new Set(["imdb:tt9:1:2"]);
    expect(getEpisodeProgress("tt1", 1, 2, 45, "tt9", trakt).watched).toBe(true);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, trakt).watched).toBe(false);
  });

  it("lets a manual unwatched override every service", () => {
    // The viewer said no; a stale Trakt or Simkl entry must not undo that.
    mocks.manualWatchedState.mockReturnValue(false);
    const seen = new Set(["1:2"]);
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, seen)).toEqual({
      ratio: 0,
      watched: false,
      startedAt: 0,
    });
  });

  it("counts an episode watched past the threshold", () => {
    mocks.readResumeEntry.mockReturnValue({ ms: 45 * 60_000 * 0.9, t: 1_700_000_000_000 });
    const p = getEpisodeProgress("tt1", 1, 2, 45, null, NONE);
    expect(p.watched).toBe(true);
    expect(p.ratio).toBeCloseTo(0.9, 2);
  });

  it("leaves an episode barely started unwatched", () => {
    mocks.readResumeEntry.mockReturnValue({ ms: 45 * 60_000 * 0.1, t: 1_700_000_000_000 });
    const p = getEpisodeProgress("tt1", 1, 2, 45, null, NONE);
    expect(p.watched).toBe(false);
    expect(p.startedAt).toBe(1_700_000_000_000);
  });

  it("shows a full bar once a service says watched", () => {
    mocks.readResumeEntry.mockReturnValue({ ms: 60_000, t: 5 });
    expect(getEpisodeProgress("tt1", 1, 2, 45, null, NONE, new Set(["1:2"])).ratio).toBe(1);
  });

  it("cannot compute a ratio without a runtime", () => {
    mocks.readResumeEntry.mockReturnValue({ ms: 10 * 60_000, t: 5 });
    expect(getEpisodeProgress("tt1", 1, 2, null, null, NONE).ratio).toBe(0);
  });
});

describe("resumeDefaultSeason", () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 10 },
    { seasonNumber: 2, episodeCount: 10 },
    { seasonNumber: 3, episodeCount: 10 },
  ];

  it("opens the only season there is", () => {
    expect(resumeDefaultSeason("tt1", [{ seasonNumber: 1, episodeCount: 8 }])).toBe(1);
  });

  it("opens the first unfinished season", () => {
    const watched = new Set(Array.from({ length: 10 }, (_, i) => `1:${i + 1}`));
    expect(resumeDefaultSeason("tt1", seasons, watched)).toBe(2);
  });

  it("stays on the season last played", () => {
    expect(resumeDefaultSeason("tt1", seasons, new Set(), 2)).toBe(2);
  });

  it("moves on when the season last played is finished", () => {
    const watched = new Set(Array.from({ length: 10 }, (_, i) => `1:${i + 1}`));
    expect(resumeDefaultSeason("tt1", seasons, watched, 1)).toBe(2);
  });

  it("ignores specials when choosing", () => {
    const withSpecials = [{ seasonNumber: 0, episodeCount: 3 }, ...seasons];
    expect(resumeDefaultSeason("tt1", withSpecials)).toBe(1);
  });
})
