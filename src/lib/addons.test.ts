import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./addon-store", () => ({
  fetchManifestAt: vi.fn(),
  filterEnabled: vi.fn(),
  loadInstalled: vi.fn(),
}));

import { torrentioConfigFor, withDebridKeys, userAddons, setUserAddons, setUserAddonsRaw, gatherCatalogAddons, loadAddonRows, type Addon } from "./addons";
import { safeFetch } from "./safe-fetch";
import { filterEnabled, loadInstalled } from "./addon-store";

describe("addon collection transport outcomes", () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(filterEnabled).mockImplementation((items) => items);
    vi.mocked(loadInstalled).mockReturnValue([]);
  });
  it.each([null, {}, { addons: "invalid" }])("rejects an unavailable or malformed strict collection: %j", async (result) => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(JSON.stringify({ result })));
    await expect(userAddons("fixture-only", { strict: true })).rejects.toThrow("Addon collection unavailable");
  });
  it("distinguishes a valid empty collection from an HTTP failure", async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(new Response(JSON.stringify({ result: { addons: [] } })));
    await expect(userAddons("fixture-only", { strict: true })).resolves.toEqual([]);
    vi.mocked(safeFetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(userAddons("fixture-only", { strict: true })).rejects.toThrow();
    await expect(userAddons("fixture-only")).resolves.toEqual([]);
  });
  it("rejects an explicit API write failure in both collection writers", async () => {
    const item = { transportUrl: "https://fixture.invalid/manifest.json", manifest: { id: "fixture", name: "Fixture" } };
    vi.mocked(safeFetch).mockImplementation(async () => new Response(JSON.stringify({ result: { success: false } })));
    await expect(setUserAddons("fixture-only", [item])).resolves.toBe(false);
    await expect(setUserAddonsRaw("fixture-only", [item])).resolves.toBe(false);
    vi.mocked(safeFetch).mockResolvedValue(new Response(JSON.stringify({ result: { success: true } })));
    await expect(setUserAddons("fixture-only", [item])).resolves.toBe(true);
  });
  it("reports lookup failure without pretending the connected account is empty", async () => {
    const diagnostics = { failed: false };
    vi.mocked(safeFetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(gatherCatalogAddons("fixture-only", diagnostics)).resolves.toEqual([]);
    expect(diagnostics.failed).toBe(true);
  });
  it("reports Home catalog HTTP errors while preserving successful rows", async () => {
    const diagnostics = { failed: false };
    vi.mocked(loadInstalled).mockReturnValue([{ id: "fixture", installedAt: 0, transportUrl: "https://fixture.invalid/manifest.json", manifest: { id: "fixture", name: "Fixture", catalogs: [{ id: "good", type: "movie", name: "Available" }, { id: "bad", type: "movie", name: "Unavailable" }] } }]);
    vi.mocked(safeFetch).mockImplementation(async (url) => String(url).includes("/bad") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ metas: [{ id: "film", name: "Film", type: "movie" }] })));
    const rows = await loadAddonRows(null, { diagnostics });
    expect(diagnostics.failed).toBe(true);
    expect(rows.map((row) => row.name)).toEqual(["Available"]);
  });
});

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
