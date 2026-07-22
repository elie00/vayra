import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authKey: null as string | null,
  fetch: vi.fn(),
  setUserAddons: vi.fn(),
  userAddons: vi.fn(),
}));

vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.fetch }));
vi.mock("./auth", () => ({ readActiveStremioAuthKey: () => mocks.authKey }));
vi.mock("./addons", () => ({
  setUserAddons: mocks.setUserAddons,
  userAddons: mocks.userAddons,
}));

import { installFromUrl, loadInstalled, manifestRequiresConfiguration } from "./addon-store";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  mocks.authKey = null;
  mocks.fetch.mockReset();
  mocks.setUserAddons.mockReset();
  mocks.userAddons.mockReset();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

function manifestResponse(id: string, name = id) {
  return {
    ok: true,
    json: async () => ({ id, name, version: "1.0.0" }),
  };
}

describe("addon installation", () => {
  it("installs locally without treating Stremio as a requirement", async () => {
    mocks.fetch.mockResolvedValueOnce(manifestResponse("local.addon"));

    const result = await installFromUrl("https://addon.example/local/manifest.json");

    expect(result.syncedToStremio).toBe(false);
    expect(mocks.userAddons).not.toHaveBeenCalled();
    expect(mocks.setUserAddons).not.toHaveBeenCalled();
    expect(loadInstalled()).toMatchObject([
      { id: "local.addon", transportUrl: "https://addon.example/local/manifest.json" },
    ]);
  });

  it("replaces an existing configuration with the same manifest id", async () => {
    mocks.fetch
      .mockResolvedValueOnce(manifestResponse("example.addon"))
      .mockResolvedValueOnce(manifestResponse("example.addon"));

    await installFromUrl("https://addon.example/old/manifest.json");
    const result = await installFromUrl("https://addon.example/new/manifest.json");

    expect(result.replaced).toBe(true);
    expect(loadInstalled()).toMatchObject([
      { id: "example.addon", transportUrl: "https://addon.example/new/manifest.json" },
    ]);
  });

  it("replaces an older id and syncs the final collection in one pass", async () => {
    mocks.authKey = "auth-key";
    mocks.fetch.mockResolvedValueOnce(manifestResponse("new.addon"));
    mocks.userAddons.mockResolvedValue([
      {
        manifest: { id: "old.addon", name: "Old" },
        transportUrl: "https://addon.example/old/manifest.json",
      },
      {
        manifest: { id: "new.addon", name: "New duplicate" },
        transportUrl: "https://addon.example/another/manifest.json",
      },
    ]);
    mocks.setUserAddons.mockResolvedValue(true);

    await installFromUrl("https://addon.example/new/manifest.json", {
      replaceId: "old.addon",
    });

    expect(mocks.setUserAddons).toHaveBeenCalledTimes(1);
    expect(mocks.setUserAddons).toHaveBeenCalledWith("auth-key", [
      expect.objectContaining({
        manifest: expect.objectContaining({ id: "new.addon" }),
        transportUrl: "https://addon.example/new/manifest.json",
      }),
    ]);
  });
});

describe("manifestRequiresConfiguration", () => {
  it("recognizes both Stremio configuration hints", () => {
    expect(
      manifestRequiresConfiguration({
        id: "a",
        name: "A",
        behaviorHints: { configurable: true },
      }),
    ).toBe(true);
    expect(
      manifestRequiresConfiguration({
        id: "b",
        name: "B",
        behaviorHints: { configurationRequired: true },
      }),
    ).toBe(true);
    expect(manifestRequiresConfiguration(null)).toBe(false);
  });
});
