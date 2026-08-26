import { describe, expect, it } from "vitest";
import { rankAndPick } from "./scoring-rank";
import type { ScoredStream } from "../types";

function s(over: Partial<ScoredStream> & { score: number }): ScoredStream {
  return {
    name: over.name ?? `s${over.score}`,
    title: "",
    tier: "1080p",
    reasons: [],
    cached: {},
    ...over,
  } as ScoredStream;
}

describe("rankAndPick", () => {
  it("puts the highest score first", () => {
    const { all } = rankAndPick([s({ score: 10 }), s({ score: 30 }), s({ score: 20 })], []);
    expect(all.map((x) => x.score)).toEqual([30, 20, 10]);
  });

  it("plays the best stream the debrid already holds", () => {
    const streams = [
      s({ score: 100, name: "uncached" }),
      s({ score: 50, name: "cached", cached: { rd: true } }),
    ];
    expect(rankAndPick(streams, ["rd"]).primary?.name).toBe("cached");
  });

  it("counts a ready URL as cached", () => {
    const streams = [s({ score: 10, name: "direct", url: "https://cdn/a.mkv" })];
    expect(rankAndPick(streams, []).primary?.name).toBe("direct");
  });

  it("has no primary when nothing is ready to play", () => {
    expect(rankAndPick([s({ score: 10 })], ["rd"]).primary).toBeNull();
  });

  it("ignores a debrid the user has not enabled", () => {
    const streams = [s({ score: 10, name: "tb-only", cached: { tb: true } })];
    expect(rankAndPick(streams, ["rd"]).primary).toBeNull();
    expect(rankAndPick(streams, ["tb"]).primary?.name).toBe("tb-only");
  });

  it("offers one stream per tier, preferring a cached one", () => {
    const streams = [
      s({ score: 90, tier: "4K", name: "4k-uncached" }),
      s({ score: 40, tier: "4K", name: "4k-cached", cached: { rd: true } }),
      s({ score: 60, tier: "1080p", name: "fhd", cached: { rd: true } }),
    ];
    const { byTier } = rankAndPick(streams, ["rd"]);
    expect(byTier["4K"]?.name).toBe("4k-cached");
    expect(byTier["1080p"]?.name).toBe("fhd");
  });

  it("keeps score order inside each cached group", () => {
    const streams = [
      s({ score: 10, name: "low-cached", cached: { rd: true } }),
      s({ score: 90, name: "high-uncached" }),
      s({ score: 50, name: "mid-cached", cached: { rd: true } }),
    ];
    const { byTier } = rankAndPick(streams, ["rd"]);
    // Both cached ones share a tier; the better-scoring one represents it.
    expect(byTier["1080p"]?.name).toBe("mid-cached");
  });

  it("follows addon order when asked to", () => {
    const streams = [
      s({ score: 90, name: "second-addon", addonPriority: 2, addonReturnIdx: 0 }),
      s({ score: 10, name: "first-addon", addonPriority: 1, addonReturnIdx: 0 }),
    ];
    expect(rankAndPick(streams, [], false, true).all[0].name).toBe("first-addon");
    expect(rankAndPick(streams, [], false, false).all[0].name).toBe("second-addon");
  });

  it("prefers AAC audio when the setting asks for it", () => {
    const streams = [
      s({ score: 90, name: "ddplus", cached: { rd: true }, audio: { codec: "DD+", channels: 6 } }),
      s({ score: 50, name: "aac", cached: { rd: true }, audio: { codec: "AAC", channels: 2 } }),
    ];
    expect(rankAndPick(streams, ["rd"], true).primary?.name).toBe("aac");
    expect(rankAndPick(streams, ["rd"], false).primary?.name).toBe("ddplus");
  });

  it("keeps the best score when no AAC is on offer", () => {
    const streams = [s({ score: 90, name: "ddplus", cached: { rd: true }, audio: { codec: "DD+", channels: 6 } })];
    expect(rankAndPick(streams, ["rd"], true).primary?.name).toBe("ddplus");
  });

  it("has nothing to offer for an empty list", () => {
    const r = rankAndPick([], ["rd"]);
    expect(r.primary).toBeNull();
    expect(r.all).toEqual([]);
    expect(r.byTier).toEqual({});
  });
})
