// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const tauriPluginFetchMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => tauriPluginFetchMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
  tauriPluginFetchMock.mockReset();
  (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
  vi.resetModules();
});

afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
});

describe("safeFetch on Tauri", () => {
  it("aborts promptly and cancels the native Rust request without falling back to plugin-http", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "vayra_fetch_cancel") return Promise.resolve(true);
      return new Promise(() => {});
    });
    const { safeFetch } = await import("./safe-fetch");
    const ac = new AbortController();
    const pending = safeFetch("https://example.com/stream.json", { signal: ac.signal });
    const fetchCall = invokeMock.mock.calls.find(([cmd]) => cmd === "vayra_fetch");
    expect(fetchCall).toBeDefined();
    const requestId = (fetchCall![1] as { args: { requestId?: number } }).args.requestId;
    expect(typeof requestId).toBe("number");

    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).toHaveBeenCalledWith("vayra_fetch_cancel", { requestId });
    expect(tauriPluginFetchMock).not.toHaveBeenCalled();
  });

  it("routes URL instances through vayra_fetch on Tauri", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      ok: true,
      body: '{"ok":true}',
      contentType: "application/json",
      contentLength: null,
    });
    const { safeFetch } = await import("./safe-fetch");
    const res = await safeFetch(new URL("https://api.themoviedb.org/3/configuration"));
    expect(res.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      "vayra_fetch",
      expect.objectContaining({
        args: expect.objectContaining({ url: "https://api.themoviedb.org/3/configuration" }),
      }),
    );
    expect(tauriPluginFetchMock).not.toHaveBeenCalled();
  });

  it("forwards content-length headers returned by vayra_fetch", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      ok: true,
      body: "",
      contentType: "video/mp4",
      contentLength: "536870912",
    });
    const { safeFetch } = await import("./safe-fetch");
    const res = await safeFetch("https://example.com/movie.mp4", { method: "HEAD" });
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("536870912");
  });
});
