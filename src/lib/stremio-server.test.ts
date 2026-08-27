import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

async function loadInTauri() {
  vi.resetModules();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  return await import("./stremio-server");
}

afterEach(() => {
  mocks.invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("cast server actions", () => {
  it("reports a successful restart command", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    const server = await loadInTauri();

    await expect(server.restartCastServer()).resolves.toEqual({ ok: true });
    expect(mocks.invoke).toHaveBeenCalledWith("cast_server_restart");
  });

  it("preserves restart command failures", async () => {
    mocks.invoke.mockRejectedValue(new Error("sidecar unavailable"));
    const server = await loadInTauri();

    await expect(server.restartCastServer()).resolves.toEqual({
      ok: false,
      message: "sidecar unavailable",
    });
  });

  it("preserves stop command failures", async () => {
    mocks.invoke.mockRejectedValue("command blocked");
    const server = await loadInTauri();

    await expect(server.stopCastServer()).resolves.toEqual({
      ok: false,
      message: "command blocked",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("cast_server_stop");
  });
});
