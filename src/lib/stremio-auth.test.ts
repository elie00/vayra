// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  openUrlMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@/lib/window", () => ({
  openUrl: openUrlMock,
}));

import { startStremioWebAuth } from "./stremio-auth";

describe("startStremioWebAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
    invokeMock.mockReset();
    listenMock.mockReset();
    openUrlMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  });

  it("waits up to 600s before timing out", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "stremio_auth_start") return Promise.resolve(43210);
      if (cmd === "stremio_auth_take_key") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);

    const promise = startStremioWebAuth();
    let settled = false;
    let rejectionMessage: string | null = null;
    promise.then(
      () => {
        settled = true;
      },
      (err: Error) => {
        settled = true;
        rejectionMessage = err.message;
      },
    );

    // Flush microtasks for dynamic imports + invoke("stremio_auth_start")
    await vi.advanceTimersByTimeAsync(0);
    expect(openUrlMock).toHaveBeenCalledWith(
      expect.stringContaining("appCallback=http%3A%2F%2F127.0.0.1%3A43210%2Fcb"),
    );

    // Still pending after old 300s timeout
    await vi.advanceTimersByTimeAsync(599_000);
    expect(settled).toBe(false);

    // Rejects at 600s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(true);
    expect(rejectionMessage).toBe("Timed out waiting for the browser. Try again.");
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
