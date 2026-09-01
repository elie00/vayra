import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HostUnreachableError,
  hostKey,
  isLocalHost,
  netGuardSnapshot,
  resetNetGuard,
  withHostGuard,
} from "./net-guard";

afterEach(() => {
  resetNetGuard();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("host classification", () => {
  it("treats loopback and localhost as local", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("127.5.5.5")).toBe(true);
    expect(isLocalHost("[::1]")).toBe(true);
    expect(isLocalHost("v3-cinemeta.strem.io")).toBe(false);
  });

  it("skips guarding for local, non-http and unparseable URLs", () => {
    expect(hostKey("http://127.0.0.1:11470/stream")).toBeNull();
    expect(hostKey("magnet:?xt=urn:btih:abc")).toBeNull();
    expect(hostKey("not a url")).toBeNull();
    expect(hostKey("https://v3-cinemeta.strem.io/manifest.json")).toBe("v3-cinemeta.strem.io");
  });
});

describe("per-host concurrency cap", () => {
  it("runs no more than six requests to one host at a time", async () => {
    const gates = Array.from({ length: 10 }, () => deferred<string>());
    let started = 0;
    let peak = 0;
    let inFlight = 0;

    const runs = gates.map((g) =>
      withHostGuard("https://v3-cinemeta.strem.io/meta.json", () => {
        started++;
        inFlight++;
        peak = Math.max(peak, inFlight);
        return g.promise.finally(() => {
          inFlight--;
        });
      }),
    );

    // Let the queue settle before anything resolves.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(started).toBe(6);

    gates.forEach((g) => g.resolve("ok"));
    await Promise.all(runs);

    expect(started).toBe(10);
    expect(peak).toBe(6);
  });

  it("does not let one host block another", async () => {
    const blocked = Array.from({ length: 6 }, () => deferred<string>());
    blocked.forEach((g) =>
      withHostGuard("https://slow.example/a", () => g.promise).catch(() => null),
    );

    let otherRan = false;
    await withHostGuard("https://fast.example/b", async () => {
      otherRan = true;
      return "ok";
    });

    expect(otherRan).toBe(true);
    blocked.forEach((g) => g.resolve("ok"));
  });

  it("does not queue local addresses", async () => {
    const gates = Array.from({ length: 8 }, () => deferred<string>());
    let started = 0;
    gates.forEach((g) =>
      withHostGuard("http://127.0.0.1:11470/stream", () => {
        started++;
        return g.promise;
      }),
    );

    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(started).toBe(8);
    gates.forEach((g) => g.resolve("ok"));
  });
});

describe("circuit breaker", () => {
  const fail = () => Promise.reject(new Error("connection refused"));

  async function tripHost(url: string) {
    for (let i = 0; i < 5; i++) {
      await withHostGuard(url, fail).catch(() => null);
    }
  }

  it("stops opening sockets once a host keeps failing", async () => {
    const url = "https://v3-cinemeta.strem.io/meta.json";
    await tripHost(url);

    let attempted = false;
    await expect(
      withHostGuard(url, () => {
        attempted = true;
        return Promise.resolve("ok");
      }),
    ).rejects.toBeInstanceOf(HostUnreachableError);

    expect(attempted).toBe(false);
  });

  it("lets the host through again after the cooldown", async () => {
    vi.useFakeTimers();
    const url = "https://v3-cinemeta.strem.io/meta.json";
    await tripHost(url);

    vi.advanceTimersByTime(30_000);

    await expect(withHostGuard(url, () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("clears the failure count on a success", async () => {
    const url = "https://flaky.example/x";
    for (let i = 0; i < 4; i++) await withHostGuard(url, fail).catch(() => null);
    await withHostGuard(url, () => Promise.resolve("ok"));
    for (let i = 0; i < 4; i++) await withHostGuard(url, fail).catch(() => null);

    await expect(withHostGuard(url, () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("does not trip on HTTP error responses", async () => {
    const url = "https://alive.example/404";
    // A 404 resolves — the host answered, so it must not count as a failure.
    for (let i = 0; i < 8; i++) {
      await withHostGuard(url, () => Promise.resolve(new Response("", { status: 404 })));
    }
    const snap = netGuardSnapshot().find((s) => s.host === "alive.example");
    expect(snap?.trippedForMs).toBe(0);
  });
});
