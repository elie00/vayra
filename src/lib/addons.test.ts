import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./addon-store", () => ({
  fetchManifestAt: vi.fn(),
  filterEnabled: vi.fn(),
  loadInstalled: vi.fn(),
}));

import { torrentioConfigFor, withDebridKeys, type Addon } from "./addons";

function torrentio(transportUrl: string): Addon {
  return {
    transportUrl,
    manifest: { id: "com.stremio.torrentio.addon", name: "Torrentio" },
  };
}

describe("torrentioConfigFor", () => {
  it("keeps debrid-only config unchanged when no language is preferred", () => {
    expect(torrentioConfigFor({ tbKey: "K" })).toBe("torbox=K");
  });

  it("emits a language segment without any debrid key", () => {
    expect(torrentioConfigFor({}, ["French"])).toBe("language=french");
  });

  it("puts the language before the debrid key", () => {
    expect(torrentioConfigFor({ tbKey: "K" }, ["French"])).toBe("language=french|torbox=K");
  });

  it("ignores English (Torrentio has no such value)", () => {
    expect(torrentioConfigFor({}, ["English"])).toBe("");
  });

  it("maps regional names", () => {
    expect(torrentioConfigFor({}, ["Spanish (Latin America)"])).toBe("language=latino");
  });

  it("dedupes languages that map to the same value", () => {
    expect(torrentioConfigFor({}, ["Portuguese", "Portuguese (Brazil)"])).toBe(
      "language=portuguese",
    );
  });

  it("ignores unknown language names", () => {
    expect(torrentioConfigFor({}, ["Klingon"])).toBe("");
  });
});

describe("withDebridKeys", () => {
  it("adds the language to a bare Torrentio", () => {
    const out = withDebridKeys([torrentio("https://torrentio.strem.fun/manifest.json")], {}, [
      "French",
    ]);
    expect(out[0].transportUrl).toBe("https://torrentio.strem.fun/language=french/manifest.json");
  });

  it("leaves a user-configured Torrentio untouched", () => {
    const url = "https://torrentio.strem.fun/providers=yts|realdebrid=X/manifest.json";
    const out = withDebridKeys([torrentio(url)], { tbKey: "K" }, ["French"]);
    expect(out[0].transportUrl).toBe(url);
  });

  it("leaves both entries untouched when several Torrentio are installed", () => {
    const addons = [
      torrentio("https://torrentio.strem.fun/manifest.json"),
      torrentio("https://torrentio.strem.fun/manifest.json"),
    ];
    const out = withDebridKeys(addons, {}, ["French"]);
    expect(out.map((a) => a.transportUrl)).toEqual([
      "https://torrentio.strem.fun/manifest.json",
      "https://torrentio.strem.fun/manifest.json",
    ]);
  });

  it("returns non-Torrentio addons by reference", () => {
    const other: Addon = {
      transportUrl: "https://example.com/manifest.json",
      manifest: { id: "com.example", name: "Example" },
    };
    const out = withDebridKeys([other], {}, ["French"]);
    expect(out[0]).toBe(other);
  });
});
