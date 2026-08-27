import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_COLORS,
  THEME_PRESETS,
  customColorsToTokens,
  getThemeById,
  isKnownPreset,
  nextColorTheme,
} from "./theme";

describe("theme decisions", () => {
  it("resolves every built-in preset and rejects unknown identifiers", () => {
    for (const id of Object.keys(THEME_PRESETS)) {
      expect(getThemeById(id)?.id).toBe(id);
      expect(isKnownPreset(id)).toBe(true);
    }
    expect(getThemeById("missing-theme")).toBeNull();
    expect(isKnownPreset("missing-theme")).toBe(false);
  });

  it("cycles only through selectable color themes", () => {
    expect(nextColorTheme("missing-theme")).toBe("cool-grey");
    expect(nextColorTheme("crunch")).toBe("cool-grey");

    let current = nextColorTheme("missing-theme");
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      current = nextColorTheme(current);
    }

    expect(current).toBe("cool-grey");
    expect(visited.has("crunch")).toBe(false);
    expect(visited.size).toBe(Object.keys(THEME_PRESETS).length - 1);
  });

  it("derives all CSS tokens from custom colors", () => {
    expect(customColorsToTokens(DEFAULT_CUSTOM_COLORS)).toEqual({
      "--color-canvas": "#0a0b0d",
      "--color-surface": "#111214",
      "--color-elevated": "#18191c",
      "--color-raised": "#242529",
      "--color-ink": "#f4f2ed",
      "--color-ink-muted": "#a8aaad",
      "--color-ink-subtle": "#737579",
      "--color-edge": "#4b4d508c",
      "--color-edge-soft": "#4b4d5040",
      "--color-accent": "#a8aaad",
      "--color-accent-soft": "#a8aaad2e",
      "--color-danger": "#b94545",
    });
  });
});
