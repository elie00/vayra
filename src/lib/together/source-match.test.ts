import { describe, expect, it } from "vitest";
import { parseStream } from "@/lib/streams/parser";
import type { ScoredStream } from "@/lib/streams/types";
import { matchBadge, scoreSourceMatch, sortByHostMatch } from "./source-match";

function candidate(title: string, hash: string, size: number): ScoredStream {
  return {
    ...parseStream({
      title,
      infoHash: hash,
      addonId: "test",
      addonName: "Test",
      behaviorHints: { filename: `${title}.mkv`, videoSize: size },
    }),
    score: 0,
    reasons: [],
    tier: "1080p",
  };
}

describe("Together source matching", () => {
  it("matches the same torrent case-insensitively and rewards the same file", () => {
    const hash = "abcdef0123456789abcdef0123456789abcdef01";
    const stream = { ...candidate("Movie.1080p.WEB-DL-GROUP", hash.toUpperCase(), 2_000), fileIdx: 3 };
    const score = scoreSourceMatch(stream, {
      title: "Movie 1080p WEB-DL GROUP",
      infoHash: hash,
      fileIdx: 3,
      resolution: "1080p",
      sizeBytes: 2_000,
    });

    expect(score).toBeGreaterThanOrEqual(1_350);
    expect(matchBadge(score)).toBe("same");
  });

  it("sorts close metadata matches first without mutating picker order", () => {
    const unrelated = candidate("Unrelated.Movie.720p", "a".repeat(40), 500);
    const close = candidate("Host.Movie.1080p.WEB-DL-GROUP", "b".repeat(40), 1_000);
    const input = [unrelated, close];

    const { sorted, scores } = sortByHostMatch(input, {
      title: "Host Movie 1080p WEB-DL GROUP",
      resolution: "1080p",
      sizeBytes: 1_000,
    });

    expect(input).toEqual([unrelated, close]);
    expect(sorted[0]).toBe(close);
    expect(matchBadge(scores.get(close))).toBe("close");
    expect(matchBadge(scores.get(unrelated))).toBeNull();
  });
});
