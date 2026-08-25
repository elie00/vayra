import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/settings";
import { applyLocaleCascade, regionFromNavigator } from "./locale-cascade";
import { localeForRegion } from "./locale-map";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("regionFromNavigator", () => {
  const cases: Array<[string, string | null]> = [
    ["fr-FR", "FR"],
    ["fr", "FR"],
    ["fr-BE", "BE"],
    ["en-US", "US"],
    ["ar", "SA"],
    ["", null],
    ["de", null],
  ];
  for (const [language, expected] of cases) {
    it(`maps ${JSON.stringify(language)} to ${expected}`, () => {
      vi.stubGlobal("navigator", { language });
      expect(regionFromNavigator()).toBe(expected);
    });
  }
});

describe("applyLocaleCascade", () => {
  it("puts French first without dropping the existing languages", () => {
    const patches: Array<Partial<Settings>> = [];
    applyLocaleCascade((patch) => patches.push(patch), localeForRegion("FR"), {
      preferredLanguages: ["English"],
      preferredSubLangs: ["English"],
      preferredAudioLangs: ["English", "Japanese"],
    });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      uiLanguage: "fr",
      tmdbLanguage: "fr-FR",
      preferredLanguages: ["French", "English"],
      preferredSubLangs: ["French", "English"],
      preferredAudioLangs: ["French", "English", "Japanese"],
    });
  });

  it("does not duplicate a language that is already listed", () => {
    const patches: Array<Partial<Settings>> = [];
    applyLocaleCascade((patch) => patches.push(patch), localeForRegion("FR"), {
      preferredLanguages: ["English", "French"],
      preferredSubLangs: ["French"],
      preferredAudioLangs: ["French", "English"],
    });
    expect(patches[0].preferredLanguages).toEqual(["French", "English"]);
    expect(patches[0].preferredSubLangs).toEqual(["French"]);
    expect(patches[0].preferredAudioLangs).toEqual(["French", "English"]);
  });
});
