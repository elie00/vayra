import { describe, expect, it } from "vitest";
import { contentKeyOf } from "./content-key";

describe("contentKeyOf", () => {
  it("is deterministic and 8 hex chars", () => {
    const k = contentKeyOf("tt0111161||");
    expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(contentKeyOf("tt0111161||")).toBe(k);
  });

  it("distinguishes different media keys (title, season, episode)", () => {
    const movie = contentKeyOf("tt0111161||");
    const s1e1 = contentKeyOf("tt0903747|1|1");
    const s1e2 = contentKeyOf("tt0903747|1|2");
    const s2e1 = contentKeyOf("tt0903747|2|1");
    expect(new Set([movie, s1e1, s1e2, s2e1]).size).toBe(4);
  });

  it("carries no raw id — output is a fixed-width opaque token", () => {
    // The raw catalogue id must not survive verbatim in the fingerprint.
    expect(contentKeyOf("tt0111161||")).not.toContain("tt0111161");
  });
});
