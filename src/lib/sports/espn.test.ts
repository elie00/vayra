import { afterEach, describe, expect, it } from "vitest";
import { setUiLanguage } from "@/lib/i18n/store";
import {
  getGroupLabel,
  getLeagueLabel,
  liveCount,
  sortGames,
  type SportsGame,
} from "./espn";

function game(id: string, state: SportsGame["state"], startMs: number): SportsGame {
  return {
    id,
    league: "TEST",
    state,
    detail: "",
    home: { name: "Home", abbr: "H", logo: "", score: "0", winner: false },
    away: { name: "Away", abbr: "A", logo: "", score: "0", winner: false },
    startMs,
  };
}

afterEach(() => setUiLanguage("en"));

describe("ESPN sports decisions", () => {
  it("orders live first, upcoming chronologically and finished most-recent first", () => {
    const input = [
      game("old-finished", "post", 10),
      game("later", "pre", 40),
      game("live", "in", 30),
      game("recent-finished", "post", 50),
      game("sooner", "pre", 20),
    ];

    expect(sortGames(input).map(({ id }) => id)).toEqual([
      "live",
      "sooner",
      "later",
      "recent-finished",
      "old-finished",
    ]);
    expect(input.map(({ id }) => id)).toEqual([
      "old-finished",
      "later",
      "live",
      "recent-finished",
      "sooner",
    ]);
  });

  it("counts live games only", () => {
    expect(liveCount([game("live-1", "in", 1), game("next", "pre", 2), game("live-2", "in", 3)])).toBe(2);
  });

  it("uses Arabic labels only for the Arabic interface", () => {
    const label = { label: "العربية", labelEn: "English" };
    setUiLanguage("fr");
    expect(getLeagueLabel({ ...label, key: "T", tag: "T", path: "test", logo: "", group: "test" })).toBe("English");
    expect(getGroupLabel(label)).toBe("English");

    setUiLanguage("ar");
    expect(getLeagueLabel({ ...label, key: "T", tag: "T", path: "test", logo: "", group: "test" })).toBe("العربية");
    expect(getGroupLabel(label)).toBe("العربية");
  });
});
