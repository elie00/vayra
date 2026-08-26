import { afterAll, beforeAll, describe, expect, it } from "vitest";
import en from "./locales/en";
import fr from "./locales/fr";
import { setUiLanguage } from "./store";
import { isUiLanguageLoaded, loadUiLanguage, t } from "./translate";

beforeAll(async () => loadUiLanguage("fr"));
afterAll(() => setUiLanguage("en"));

describe("French interface catalog", () => {
  it("contains every key from the canonical English catalog", () => {
    expect(Object.keys(en).filter((key) => !(key in fr))).toEqual([]);
  });

  it("translates entries and interpolates variables", () => {
    expect(isUiLanguageLoaded("fr")).toBe(true);
    setUiLanguage("fr");
    expect(t("common.save")).toBe("Enregistrer");
    expect(t("Guest Stars · {n}", { n: 3 })).toBe("Invités · 3");
  });

  it("falls back to the source key for an unknown entry", () => {
    setUiLanguage("fr");
    expect(t("missing.translation.key")).toBe("missing.translation.key");
  });
});
