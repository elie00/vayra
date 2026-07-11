import { describe, expect, it } from "vitest";
import { parseThemeJson } from "@/lib/custom-themes";
import { STARTER_GALLERY_THEMES } from "./theme-gallery-data";

describe("bundled theme gallery", () => {
  it("contains unique, importable themes", () => {
    const names = STARTER_GALLERY_THEMES.map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(STARTER_GALLERY_THEMES.length).toBeGreaterThanOrEqual(5);

    for (const entry of STARTER_GALLERY_THEMES) {
      const result = parseThemeJson(entry.json);
      expect(result.ok, entry.name).toBe(true);
      if (result.ok) {
        expect(result.theme.name).toBe(entry.name);
        expect(result.theme.swatch).toEqual(entry.swatch);
      }
    }
  });
});
