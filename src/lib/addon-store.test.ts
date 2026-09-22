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

import { installFromUrl, loadInstalled, manifestRequiresConfiguration, uninstallAddon } from "./addon-store";

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
    expect(result.syncStatus).toBe("not-connected");
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

    const result = await installFromUrl("https://addon.example/new/manifest.json", {
      replaceId: "old.addon",
    });
    expect(result.syncStatus).toBe("synced");

    expect(mocks.setUserAddons).toHaveBeenCalledTimes(1);
    expect(mocks.setUserAddons).toHaveBeenCalledWith("auth-key", [
      expect.objectContaining({
        manifest: expect.objectContaining({ id: "new.addon" }),
        transportUrl: "https://addon.example/new/manifest.json",
      }),
    ]);
  });
});

describe("honest addon synchronization results", () => {
  it.each(["read", "write", "refused"])("keeps local installation when Stremio %s fails", async (failure) => {
    mocks.authKey = "fixture-session";
    mocks.fetch.mockResolvedValueOnce(manifestResponse("example.addon"));
    mocks.userAddons.mockResolvedValue([]);
    mocks.setUserAddons.mockResolvedValue(true);
    if (failure === "read") mocks.userAddons.mockRejectedValueOnce(new Error("offline"));
    else if (failure === "write") mocks.setUserAddons.mockRejectedValueOnce(new Error("offline"));
    else mocks.setUserAddons.mockResolvedValueOnce(false);
    const result = await installFromUrl("https://addon.example/manifest.json");
    expect(result).toMatchObject({ syncStatus: "failed", syncedToStremio: false });
    expect(loadInstalled()).toHaveLength(1);
  });

  it("does not report success or try syncing if both local writes fail", async () => {
    mocks.authKey = "fixture-session";
    mocks.fetch.mockResolvedValueOnce(manifestResponse("example.addon"));
    const full = new DOMException("Fixture storage full", "QuotaExceededError");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw full; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(installFromUrl("https://addon.example/manifest.json")).rejects.toThrow(full);
    expect(mocks.userAddons).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("addon removal safety", () => {
  const url = "https://addon.example/manifest.json";
  const siblingUrl = "https://addon.example/other/manifest.json";
  const target = { manifest: { id: "example.addon", name: "Fixture" }, transportUrl: url };
  const sibling = { manifest: { id: "example.addon", name: "Other configuration" }, transportUrl: siblingUrl };
  beforeEach(() => {
    storage.set("harbor.installed-addons", JSON.stringify([{ id: "example.addon", transportUrl: url, installedAt: 0 }]));
  });

  it("removes only locally when no Stremio account is connected", async () => {
    await uninstallAddon("example.addon", url);
    expect(loadInstalled()).toHaveLength(0);
    expect(mocks.userAddons).not.toHaveBeenCalled();
  });

  it("removes the exact transport from the linked account and preserves sibling configurations", async () => {
    mocks.authKey = "fixture-session";
    mocks.userAddons.mockResolvedValue([target, sibling]);
    mocks.setUserAddons.mockResolvedValue(true);
    await uninstallAddon("example.addon", url);
    expect(mocks.setUserAddons).toHaveBeenCalledWith("fixture-session", [sibling]);
    expect(loadInstalled()).toHaveLength(0);
  });

  it.each(["read", "write", "refused"])("retains the local entry when linked removal %s fails", async (failure) => {
    mocks.authKey = "fixture-session";
    mocks.userAddons.mockResolvedValue([target]);
    mocks.setUserAddons.mockResolvedValue(true);
    if (failure === "read") mocks.userAddons.mockRejectedValueOnce(new Error("offline"));
    else if (failure === "write") mocks.setUserAddons.mockRejectedValueOnce(new Error("offline"));
    else mocks.setUserAddons.mockResolvedValueOnce(false);
    await expect(uninstallAddon("example.addon", url)).rejects.toThrow();
    expect(loadInstalled()).toMatchObject([{ transportUrl: url }]);
    if (failure === "read") expect(mocks.setUserAddons).not.toHaveBeenCalled();
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
