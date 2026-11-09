import { describe, expect, it } from "vitest";
import { fmtClock } from "./now-format";

describe("fmtClock", () => {
  const at1730 = new Date(2026, 10, 1, 17, 30).getTime();

  it("follows the interface language", () => {
    expect(fmtClock(at1730, "fr")).toBe("17:30");
    expect(fmtClock(at1730, "de")).toBe("17:30");
    expect(fmtClock(at1730, "en")).toMatch(/^5:30\s?PM$/);
  });
});
