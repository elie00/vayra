import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT } from "./defaults";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

const SHARED = "harbor.settings.shared";
const MIRROR = "harbor.settings";
const P2 = "harbor.settings.p2";

function memoryStorage(seed: Record<string, string>) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    dump: () => [...map.values()].join("\n"),
  };
}

/** A keychain that stores one string, like the native command. */
function keychain(initial: string | null, opts: { failWrites?: boolean } = {}) {
  const state = { value: initial, failWrites: opts.failWrites ?? false };
  mocks.invoke.mockImplementation(async (cmd: string, args?: { content: string }) => {
    if (cmd === "settings_secrets_read") return state.value;
    if (cmd === "settings_secrets_write") {
      if (state.failWrites) throw new Error("keychain locked");
      state.value = args!.content;
      return undefined;
    }
    throw new Error(`unexpected ${cmd}`);
  });
  return state;
}

async function load(seed: Record<string, string>) {
  vi.resetModules();
  const storage = memoryStorage(seed);
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("localStorage", storage);
  const vault = await import("./secret-vault");
  const store = await import("./profile-store");
  return { storage, vault, store };
}

const blob = (extra: Record<string, unknown>) => JSON.stringify({ ...DEFAULT, ...extra });
const profiles = JSON.stringify({ activeId: "default", profiles: [{ id: "default" }, { id: "p2", settingsLinked: false }] });

afterEach(() => {
  mocks.invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("secret vault", () => {
  it("moves every profile's secrets out of local storage into the keychain", async () => {
    const kc = keychain(JSON.stringify({ rdKey: "KEYCHAIN_RD" }));
    const { storage, vault, store } = await load({
      "harbor.profiles.v1": profiles,
      [SHARED]: blob({ rdKey: "SHARED_RD", traktAccessToken: "SHARED_TRAKT" }),
      [P2]: blob({ rdKey: "P2_RD" }),
      [MIRROR]: blob({ rdKey: "SHARED_RD" }),
    });

    await expect(vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR)).resolves.toBe(true);

    for (const secret of ["KEYCHAIN_RD", "SHARED_RD", "SHARED_TRAKT", "P2_RD"]) {
      expect(storage.dump()).not.toContain(secret);
    }
    const saved = JSON.parse(kc.value!);
    expect(saved.sources[SHARED]).toMatchObject({ rdKey: "KEYCHAIN_RD", traktAccessToken: "SHARED_TRAKT" });
    expect(saved.sources[P2].rdKey).toBe("P2_RD");
    // An older VAYRA only reads the top level: it still finds the active keys.
    expect(saved.rdKey).toBe("KEYCHAIN_RD");
    expect(store.loadEffective("default", true).rdKey).toBe("KEYCHAIN_RD");
    expect(store.loadEffective("p2", false).rdKey).toBe("P2_RD");
  });

  it("leaves local storage untouched when the keychain cannot be written", async () => {
    keychain(null, { failWrites: true });
    const { storage, vault, store } = await load({ "harbor.profiles.v1": profiles, [P2]: blob({ rdKey: "P2_RD" }) });

    await expect(vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR)).resolves.toBe(false);

    expect(storage.dump()).toContain("P2_RD");
    expect(store.loadEffective("p2", false).rdKey).toBe("P2_RD");
  });

  it("does not touch storage when the keychain cannot be read", async () => {
    mocks.invoke.mockRejectedValue(new Error("denied"));
    const { storage, vault, store } = await load({ [SHARED]: blob({ rdKey: "SHARED_RD" }) });

    await expect(vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR)).resolves.toBe(false);

    expect(storage.dump()).toContain("SHARED_RD");
    expect(mocks.invoke).not.toHaveBeenCalledWith("settings_secrets_write", expect.anything());
  });

  it("keeps new secrets out of the blobs and each profile's keys across a switch", async () => {
    const kc = keychain(null);
    const { storage, vault, store } = await load({ "harbor.profiles.v1": profiles, [SHARED]: blob({}), [P2]: blob({ rdKey: "P2_RD" }) });
    await vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR);

    store.persistEffective({ ...DEFAULT, rdKey: "TYPED_RD" }, "default", true);
    await vault.flushSecretVault();

    expect(storage.dump()).not.toContain("TYPED_RD");
    expect(JSON.parse(kc.value!).sources[SHARED].rdKey).toBe("TYPED_RD");
    expect(store.loadEffective("p2", false).rdKey).toBe("P2_RD");
    expect(store.loadEffective("default", true).rdKey).toBe("TYPED_RD");
  });

  it("puts secrets back into the blobs when a later keychain write fails", async () => {
    const kc = keychain(null);
    const { storage, vault, store } = await load({ "harbor.profiles.v1": profiles, [SHARED]: blob({}), [P2]: blob({ rdKey: "P2_RD" }) });
    await vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    kc.failWrites = true;

    await expect(vault.flushSecretVault()).resolves.toBe(false);

    expect(vault.vaultActive()).toBe(false);
    expect(storage.dump()).toContain("P2_RD");
    expect(store.loadEffective("p2", false).rdKey).toBe("P2_RD");
  });

  it("gives a newly unlinked profile the shared keys", async () => {
    const kc = keychain(null);
    const { vault, store } = await load({ "harbor.profiles.v1": profiles, [SHARED]: blob({ rdKey: "SHARED_RD" }) });
    await vault.hydrateSecretVault(SHARED, store.allSourceKeys(), MIRROR);

    store.forkToProfile("p3");
    await vault.flushSecretVault();

    expect(store.loadEffective("p3", false).rdKey).toBe("SHARED_RD");
    expect(JSON.parse(kc.value!).sources["harbor.settings.p3"].rdKey).toBe("SHARED_RD");
  });

  it("reads back its own format on the next launch", async () => {
    const payload = JSON.stringify({ rdKey: "A", v: 2, sources: { [SHARED]: { rdKey: "A" }, [P2]: { rdKey: "B" } } });
    keychain(payload);
    const { vault, store } = await load({ "harbor.profiles.v1": profiles, [SHARED]: blob({}), [P2]: blob({}) });

    await vault.hydrateSecretVault(P2, store.allSourceKeys(), MIRROR);

    expect(store.loadEffective("default", true).rdKey).toBe("A");
    expect(store.loadEffective("p2", false).rdKey).toBe("B");
  });
});
