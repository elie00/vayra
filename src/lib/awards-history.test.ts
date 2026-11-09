import { describe, expect, it } from "vitest";
import {
  bundledAwardsForPerson,
  bundledAwardsForTitle,
  loadAwardsData,
  mergeBundledAwards,
  readAwardHistory,
} from "./awards-history";

describe("bundled award history", () => {
  it("answers nothing before its data is loaded, and everything after", async () => {
    const live = [{ type: "bafta" as const, awardName: "BAFTA Award", result: "won" as const }];
    expect(bundledAwardsForTitle("Parasite", 2019)).toEqual([]);
    expect(bundledAwardsForPerson("Bong Joon-ho")).toEqual([]);
    expect(mergeBundledAwards(live, "Parasite", 2019)).toBe(live);
    expect(readAwardHistory("oscar", [{ key: "best_picture", name: "Best Picture" }])).toEqual([]);

    await loadAwardsData();

    expect(bundledAwardsForTitle("Parasite", 2019).some((e) => e.type === "oscar")).toBe(true);
    expect(bundledAwardsForPerson("Bong Joon-ho").some((e) => e.workTitle === "Parasite")).toBe(true);
    expect(mergeBundledAwards(live, "Parasite", 2019).some((e) => e.type === "oscar")).toBe(true);
    const [bestPicture] = readAwardHistory("oscar", [{ key: "best_picture", name: "Best Picture" }]);
    expect(bestPicture.entries.some((e) => e.workTitle === "Nomadland" && e.year === 2020)).toBe(true);
  });
});
