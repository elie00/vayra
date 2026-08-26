import { describe, expect, it } from "vitest";
import { formatRelativeWatched } from "./episode-progress";

const ago = (ms: number) => formatRelativeWatched(Date.now() - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeWatched", () => {
  it("says nothing without a timestamp", () => {
    expect(formatRelativeWatched(0)).toBe("");
  });

  it("reads the recent past in the units that suit it", () => {
    expect(ago(30 * SEC)).toBe("just now");
    expect(ago(5 * MIN)).toBe("5m ago");
    expect(ago(3 * HOUR)).toBe("3h ago");
  });

  it("names yesterday rather than counting a day", () => {
    expect(ago(DAY + HOUR)).toBe("yesterday");
    expect(ago(3 * DAY)).toBe("3 days ago");
  });

  it("moves up to weeks, months and years in turn", () => {
    expect(ago(8 * DAY)).toBe("last week");
    expect(ago(21 * DAY)).toBe("3 weeks ago");
    expect(ago(40 * DAY)).toBe("last month");
    expect(ago(200 * DAY)).toBe("6 months ago");
    expect(ago(400 * DAY)).toBe("last year");
    expect(ago(900 * DAY)).toBe("2 years ago");
  });

  it("does not read a future timestamp as a long time ago", () => {
    expect(formatRelativeWatched(Date.now() + 10 * DAY)).toBe("just now");
  });
})
