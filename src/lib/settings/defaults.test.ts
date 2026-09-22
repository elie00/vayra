import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT, STORAGE_KEY } from "./defaults";
import { loadStoredSettings } from "./load";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

describe("first-run locale detection flag", () => {
  it("preserves an explicit font choice after restarting", () => {
    storage.set(STORAGE_KEY, JSON.stringify({
      theme: { ...DEFAULT.theme, preset: "sage", fontPair: "system", fontPairOverride: true },
    }));
    expect(loadStoredSettings().theme).toMatchObject({
      preset: "sage", fontPair: "system", fontPairOverride: true,
    });
  });

  it("ships neutral defaults so detection decides the locale", () => {
    expect(DEFAULT.region).toBe("US");
    expect(DEFAULT.preferredLanguages).toEqual(["English"]);
    expect(DEFAULT.localeDetected).toBe(false);
  });

  it("leaves the flag unset on a fresh install so detection runs once", () => {
    expect(loadStoredSettings().localeDetected).toBe(false);
  });

  it("marks existing installs as already detected so their locale is never rewritten", () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify({ region: "US", uiLanguage: "en", preferredLanguages: ["English"] }),
    );
    const s = loadStoredSettings();
    expect(s.localeDetected).toBe(true);
    expect(s.region).toBe("US");
    expect(s.uiLanguage).toBe("en");
    expect(s.preferredLanguages).toEqual(["English"]);
  });

  it("keeps an explicit false so a pending detection still runs", () => {
    storage.set(STORAGE_KEY, JSON.stringify({ localeDetected: false }));
    expect(loadStoredSettings().localeDetected).toBe(false);
  });
});
