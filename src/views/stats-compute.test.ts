import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/stremio";
import { computeLibraryStats } from "./stats-compute";

const NOW = Date.parse("2026-06-28T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

function item(p: Partial<LibraryItem> & { _id: string }): LibraryItem {
  return {
    type: "movie",
    name: "Untitled",
    removed: false,
    temp: false,
    _ctime: "",
    _mtime: "",
    ...p,
  };
}

describe("computeLibraryStats", () => {
  const items: LibraryItem[] = [
    item({
      _id: "a",
      type: "movie",
      name: "A",
      state: { timeOffset: 0, duration: 7200, flaggedWatched: 1, lastWatched: daysAgo(2) },
    }),
    item({
      _id: "b",
      type: "series",
      name: "B",
      state: { timeOffset: 1800, duration: 3600, lastWatched: daysAgo(10) },
    }),
    item({ _id: "c", type: "movie", name: "C", removed: true }), // exclu
    item({
      _id: "d",
      type: "series",
      name: "D",
      isAnime: true,
      state: { timeOffset: 0, duration: 1440, flaggedWatched: 1, lastWatched: daysAgo(40) },
    }),
    item({ _id: "e", type: "movie", name: "E", removed: true, temp: true }), // inclus (temp)
  ];
  const s = computeLibraryStats(items, NOW);

  it("compte les éléments valides (exclut removed non-temp, garde temp)", () => {
    expect(s.total).toBe(4);
  });

  it("classe watched / in-progress / movies / series / anime", () => {
    expect(s.watched).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.movies).toBe(2);
    expect(s.series).toBe(2);
    expect(s.anime).toBe(1);
  });

  it("calcule le taux de complétion", () => {
    expect(s.completionRate).toBeCloseTo(0.5, 5);
  });

  it("estime les heures (durée si terminé, position sinon)", () => {
    // 7200 + 1800 + 1440 + 0 = 10440s = 2.9h
    expect(s.estimatedHours).toBeCloseTo(2.9, 5);
  });

  it("compte l'activité sur 7 et 30 jours", () => {
    expect(s.activeLast7).toBe(1); // A (2j)
    expect(s.activeLast30).toBe(2); // A (2j) + B (10j)
  });

  it("trie les visionnages récents du plus récent au plus ancien", () => {
    expect(s.recent.map((r) => r.id)).toEqual(["a", "b", "d"]);
    expect(s.recent[0].type).toBe("movie");
    expect(s.recent[1].type).toBe("series");
  });

  it("renvoie des zéros sur une bibliothèque vide", () => {
    const empty = computeLibraryStats([], NOW);
    expect(empty.total).toBe(0);
    expect(empty.completionRate).toBe(0);
    expect(empty.recent).toEqual([]);
  });
});
