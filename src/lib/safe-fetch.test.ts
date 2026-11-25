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
  it("aborts promptly without falling back to plugin-http when signal aborts", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    const { safeFetch } = await import("./safe-fetch");
    const ac = new AbortController();
    const pending = safeFetch("https://example.com/stream.json", { signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
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
