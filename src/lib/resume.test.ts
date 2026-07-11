import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearResume,
  lastPlayedEpisode,
  readResumeEntry,
  readResumeMs,
  saveResumeBatch,
  saveResumeMs,
} from "./resume";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe("resume persistence", () => {
  it("isolates movie and episode positions and clears only the requested entry", () => {
    saveResumeMs("tt-series", 12_000);
    saveResumeMs("tt-series", 34_000, 1, 2);
    saveResumeMs("tt-series", 56_000, 1, 3);

    expect(readResumeMs("tt-series")).toBe(12_000);
    expect(readResumeMs("tt-series", 1, 2)).toBe(34_000);
    clearResume("tt-series", 1, 2);
    expect(readResumeMs("tt-series", 1, 2)).toBe(0);
    expect(readResumeMs("tt-series", 1, 3)).toBe(56_000);
  });

  it("selects the most recently played valid episode from a batch", () => {
    saveResumeBatch([
      { id: "show", season: 1, episode: 9, ms: 90_000, t: 100 },
      { id: "show", season: 2, episode: 1, ms: 10_000, t: 300 },
      { id: "other", season: 9, episode: 9, ms: 99_000, t: 999 },
      { id: "show", season: 0, episode: 1, ms: 1, t: 1_000 },
      { id: "show", season: 2, episode: 0, ms: 1, t: 1_000 },
    ]);

    expect(lastPlayedEpisode("show")).toEqual({ season: 2, episode: 1, ms: 10_000, t: 300 });
  });

  it("ignores invalid positions and survives corrupt persisted JSON", () => {
    saveResumeBatch([
      { id: "movie", ms: Number.NaN },
      { id: "movie", ms: -1 },
      { id: "movie", ms: 0, t: 42 },
    ]);
    expect(readResumeEntry("movie")).toEqual({ ms: 0, t: 42 });

    values.set("harbor.resume", "{not-json");
    expect(readResumeMs("movie")).toBe(0);
    expect(lastPlayedEpisode("movie")).toBeNull();
  });
});
