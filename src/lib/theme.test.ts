import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CUSTOM_COLORS,
  DEFAULT_THEME,
  THEME_PRESETS,
  customColorsToTokens,
  getThemeById,
  isKnownPreset,
  nextColorTheme,
  applyTheme,
  activeFontPair,
  FONT_PAIRS,
} from "./theme";
import { exportThemeJson, parseThemeJson } from "./custom-themes";
import { activeLayout } from "./theme";

describe("theme decisions", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps Mac navigation in the same place for every color theme", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { userAgent: "Macintosh", platform: "MacIntel" });
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(activeLayout({ ...DEFAULT_THEME, preset: preset.id })).toBe("sidebar");
      expect(activeFontPair({ ...DEFAULT_THEME, preset: preset.id })).toBe("system");
      expect(activeFontPair({ ...DEFAULT_THEME, preset: preset.id, fontPairOverride: true, fontPair: "general-sans" })).toBe("general-sans");
    }
  });

  it("uses one native font family across all three new palettes", () => {
    for (const preset of ["obsidian", "sage", "ivory"] as const) {
      expect(activeFontPair({ ...DEFAULT_THEME, preset })).toBe("system");
    }
    expect(FONT_PAIRS.system.display).toBe(FONT_PAIRS.system.sans);
  });

  it("keeps an explicit font choice when switching palettes", () => {
    for (const preset of ["obsidian", "sage", "ivory"] as const) {
      expect(activeFontPair({ ...DEFAULT_THEME, preset, fontPair: "general-sans", fontPairOverride: true })).toBe("general-sans");
    }
  });

  it("preserves Ivory's light controls when exported and imported", () => {
    const result = parseThemeJson(exportThemeJson(THEME_PRESETS.ivory));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.colorScheme).toBe("light");
      expect(result.theme.tokens).toEqual(THEME_PRESETS.ivory.tokens);
    }
  });

  it("switches native controls to light mode for Ivory and resets on dark themes", () => {
    const root = { style: { setProperty: vi.fn(), colorScheme: "" }, dataset: {} };
    vi.stubGlobal("document", { documentElement: root });
    applyTheme({ ...DEFAULT_THEME, preset: "ivory" });
    expect(root.style.colorScheme).toBe("light");
    expect(root.style.setProperty).toHaveBeenCalledWith("--color-canvas", "#f4f0e7");
    applyTheme({ ...DEFAULT_THEME, preset: "obsidian" });
    expect(root.style.colorScheme).toBe("dark");
  });

  it.each(["obsidian", "sage", "ivory"] as const)("keeps %s readable on every opaque surface", (id) => {
    const theme = THEME_PRESETS[id];
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
        .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    expect(Object.keys(theme.tokens).sort()).toEqual(Object.keys(THEME_PRESETS["cool-grey"].tokens).sort());
    for (const fg of ["ink", "ink-muted", "ink-subtle", "accent", "danger"]) {
      for (const bg of ["canvas", "surface", "elevated", "raised"]) {
        const a = luminance(theme.tokens[`--color-${fg}`]);
        const b = luminance(theme.tokens[`--color-${bg}`]);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
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
