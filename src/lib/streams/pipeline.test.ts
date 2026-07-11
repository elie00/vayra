import { describe, expect, it } from "vitest";
import { parseStream } from "./parser";
import { computeCorpusStats, rankAndPick, scoreStream } from "./scoring";
import type { ScoreOptions } from "./scoring";
import { applyTrust } from "./trust";
import type { Stream } from "./types";

const GIB = 1024 ** 3;

function stream(title: string, size: number, infoHash: string): Stream {
  return {
    title,
    infoHash,
    url: `https://streams.example/${infoHash}.mkv`,
    addonId: "contract-addon",
    addonName: "Contract Addon",
    behaviorHints: { filename: `${title}.mkv`, videoSize: size },
  };
}

describe("stream pipeline contract", () => {
  it("parses, filters, scores and ranks playable releases end to end", () => {
    const parsed = [
      parseStream(stream("Example.Movie.2020.2160p.WEB-DL.DDP5.1.HEVC-GROUP", 8 * GIB, "a".repeat(40))),
      parseStream(stream("Example.Movie.2020.1080p.WEB-DL.AAC.x264-GROUP", 3 * GIB, "b".repeat(40))),
      parseStream(stream("Example.Movie.2020.Trailer.1080p.WEB-DL.x264-GROUP", 2 * GIB, "c".repeat(40))),
    ];
    const { keep, rejected } = applyTrust(parsed, {
      kind: "movie",
      expectedTitle: "Example Movie",
      expectedYear: 2020,
      releaseDate: "2020-01-01",
    });

    expect(keep).toHaveLength(2);
    expect(rejected.map((entry) => entry.reason)).toContain("trailer-or-extra");

    const options: ScoreOptions = { activeDebrids: [], mediaKind: "movie" };
    const corpus = computeCorpusStats(keep, options);
    const ranked = rankAndPick(
      keep.map((entry) => scoreStream(entry, options, corpus)),
      [],
      false,
      false,
    );

    expect(ranked.primary?.resolution).toBe("4K");
    expect(ranked.byTier["4K"]?.infoHash).toBe("a".repeat(40));
    expect(ranked.byTier["1080p"]?.infoHash).toBe("b".repeat(40));
  });

  it("rejects addon placeholders and suspicious payloads before scoring", () => {
    const parsed = [
      parseStream({
        name: "⚠ No streams available",
        addonId: "broken",
        addonName: "Broken",
      }),
      parseStream({
        title: "Example Movie",
        infoHash: "d".repeat(40),
        addonId: "broken",
        addonName: "Broken",
        behaviorHints: { filename: "Example.Movie.2020.1080p.exe", videoSize: 2 * GIB },
      }),
    ];

    const result = applyTrust(parsed, { kind: "movie", expectedTitle: "Example Movie" });
    expect(result.keep).toEqual([]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      "no-playable-source",
      "suspicious-extension:.exe",
    ]);
  });
});
