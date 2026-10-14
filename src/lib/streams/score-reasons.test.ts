import { describe, expect, it } from "vitest";
import { explainScore } from "./score-reasons";

describe("explainScore", () => {
  it("lists what moved the score, the strongest first, without the neutral checks", () => {
    const lines = explainScore([
      { signal: "1080p", delta: 20 },
      { signal: "addon-neutral", delta: 0 },
      { signal: "cached", delta: 60 },
      { signal: "language-mismatch", delta: -14 },
    ]);
    expect(lines).toEqual([
      { label: "Cached on your debrid service", delta: 60 },
      { label: "1080p resolution", delta: 20 },
      { label: "Not in your preferred language", delta: -14 },
    ]);
  });

  it("reads the values carried by a signal", () => {
    expect(explainScore([{ signal: "seeders=120", delta: 10 }])[0].label).toBe("120 seeders");
    expect(explainScore([{ signal: "year-mismatch:2019vs2021-recent", delta: -150 }])[0].label).toBe(
      "Year 2019 instead of 2021",
    );
    expect(explainScore([{ signal: "group:ntb", delta: 2 }])[0].label).toBe("Trusted release group (ntb)");
    expect(explainScore([{ signal: "1080p-undersized-0.9gb", delta: -200 }])[0].label).toBe(
      "Too small for its resolution",
    );
  });

  it("tells what the engine reached last time", () => {
    expect(explainScore([{ signal: "swarm-unreachable", delta: -25 }])[0].label).toBe("No peer could be reached last time");
    expect(explainScore([{ signal: "swarm-peers=14", delta: 7 }])[0].label).toBe("14 peers reached last time");
  });

  it("merges signals that say the same thing", () => {
    expect(
      explainScore([
        { signal: "zero-seeders-stale-meta", delta: -20 },
        { signal: "zero-seeders-soft", delta: -8 },
      ]),
    ).toEqual([{ label: "No seeders", delta: -28 }]);
  });

  it("keeps an unknown signal as it is rather than hiding it", () => {
    expect(explainScore([{ signal: "something-new", delta: 3 }])).toEqual([{ label: "something-new", delta: 3 }]);
  });
});
