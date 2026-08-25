import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFullscreen: vi.fn(),
  isMaximized: vi.fn(),
  setFullscreen: vi.fn(),
  toggleMaximize: vi.fn(),
  minimize: vi.fn(),
  close: vi.fn(),
  onResized: vi.fn(),
  toggleWindowFullscreen: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: mocks.isFullscreen,
    isMaximized: mocks.isMaximized,
    setFullscreen: mocks.setFullscreen,
    toggleMaximize: mocks.toggleMaximize,
    minimize: mocks.minimize,
    close: mocks.close,
    onResized: mocks.onResized,
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/platform", () => ({ isMobileTauri: () => false }));
vi.mock("@/lib/fullscreen-state", () => ({
  toggleWindowFullscreen: mocks.toggleWindowFullscreen,
}));

async function loadOn(platform: string) {
  vi.resetModules();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("navigator", { platform, userAgent: platform });
  return await import("./window");
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.toggleWindowFullscreen.mockResolvedValue(undefined);
  mocks.toggleMaximize.mockResolvedValue(undefined);
  mocks.minimize.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});

describe("toggleMaximize", () => {
  it("goes through the fullscreen path on macOS, not a raw setFullscreen", async () => {
    const win = await loadOn("MacIntel");
    await win.toggleMaximize();

    // The raw call skips the saved geometry the exit path restores.
    expect(mocks.setFullscreen).not.toHaveBeenCalled();
    expect(mocks.toggleWindowFullscreen).toHaveBeenCalledTimes(1);
  });

  it("maximizes the window everywhere else", async () => {
    const win = await loadOn("Win32");
    await win.toggleMaximize();

    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(mocks.toggleWindowFullscreen).not.toHaveBeenCalled();
  });
});

describe("minimize and close", () => {
  it("do not leave a rejection unhandled", async () => {
    const win = await loadOn("Win32");
    mocks.minimize.mockRejectedValue(new Error("no window"));
    mocks.close.mockRejectedValue(new Error("no window"));

    await expect(win.minimize()).resolves.toBeUndefined();
    await expect(win.close()).resolves.toBeUndefined();
  });
});
