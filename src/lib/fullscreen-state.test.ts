import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isFullscreen: async () => false }),
}));
vi.mock("@/lib/settings/load", () => ({ loadStoredSettings: () => ({}) }));

async function load(platform = "Win32") {
  vi.resetModules();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("document", {});
  vi.stubGlobal("navigator", { platform, userAgent: platform });
  return await import("./fullscreen-state");
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(undefined);
});

describe("entering fullscreen", () => {
  it("reads the completed AppKit state when starting on macOS", async () => {
    mocks.invoke.mockResolvedValue(true);
    const fs = await load("MacIntel");
    await vi.waitFor(() => expect(fs.getWindowFullscreen()).toBe(true));
    expect(mocks.invoke).toHaveBeenCalledWith("window_fullscreen_status");
  });

  it("waits for the native transition before changing the button", async () => {
    const fs = await load();
    let confirm!: () => void;
    mocks.invoke.mockReturnValue(new Promise<void>((resolve) => { confirm = resolve; }));
    const entering = fs.enterWindowFullscreen();
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("window_fullscreen_enter"));
    expect(fs.getWindowFullscreen()).toBe(false);
    confirm();
    await entering;
    expect(fs.getWindowFullscreen()).toBe(true);
  });

  it("does not claim fullscreen when the window refused", async () => {
    const fs = await load();
    mocks.invoke.mockRejectedValue(new Error("main window missing"));

    await fs.enterWindowFullscreen();

    expect(fs.getWindowFullscreen()).toBe(false);
  });

  it("reports fullscreen once the window is in it", async () => {
    const fs = await load();
    await fs.enterWindowFullscreen();
    expect(fs.getWindowFullscreen()).toBe(true);
  });
});

describe("leaving fullscreen", () => {
  it("never leaves fullscreen just because the player closed", async () => {
    const fs = await load();
    await fs.enterWindowFullscreen();
    mocks.invoke.mockClear();

    await fs.exitWindowFullscreenOnPlayerClose();

    expect(fs.getWindowFullscreen()).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalledWith("window_fullscreen_exit", expect.anything());
  });

  it("obeys a button press during an auto-advance", async () => {
    const fs = await load();
    await fs.enterWindowFullscreen();
    // An auto-advance asks the next exit to be ignored...
    fs.suppressFullscreenExitOnce();

    // ...but the person pressing the button meant it.
    await fs.exitWindowFullscreen({ userInitiated: true });

    expect(fs.getWindowFullscreen()).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledWith("window_fullscreen_exit", expect.anything());
  });

  it("still swallows the automatic exit an advance suppresses", async () => {
    const fs = await load();
    await fs.enterWindowFullscreen();
    fs.suppressFullscreenExitOnce();

    await fs.exitWindowFullscreen();

    expect(fs.getWindowFullscreen()).toBe(true);
  });

  it("stays in fullscreen when the window refuses to leave", async () => {
    const fs = await load();
    await fs.enterWindowFullscreen();
    mocks.invoke.mockRejectedValue(new Error("nope"));

    await fs.exitWindowFullscreen();

    expect(fs.getWindowFullscreen()).toBe(true);
  });
});
