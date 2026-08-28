import { describe, expect, it } from "vitest";
import { rankCommands } from "./command-search";

const commands = [
  { id: "resume", label: "Resume North Line", keywords: ["continue", "LUMA"] },
  { id: "search", label: "Search", keywords: ["movies", "shows"] },
  { id: "home", label: "Home", keywords: ["start"] },
];

describe("command ranking", () => {
  it("matches aliases and ignores accents and case", () => {
    expect(rankCommands(commands, "CONTINUE").map((item) => item.id)).toEqual(["resume"]);
    expect(rankCommands([{ id: "settings", label: "Réglages" }], "reglages")).toHaveLength(1);
  });

  it("ranks exact labels ahead of keyword matches", () => {
    const result = rankCommands([
      { id: "search", label: "Search" },
      { id: "discover", label: "Discover", keywords: ["search"] },
    ], "search");
    expect(result.map((item) => item.id)).toEqual(["search", "discover"]);
  });

  it("requires every query token to match", () => {
    expect(rankCommands(commands, "resume luma").map((item) => item.id)).toEqual(["resume"]);
    expect(rankCommands(commands, "resume settings")).toEqual([]);
  });
});
