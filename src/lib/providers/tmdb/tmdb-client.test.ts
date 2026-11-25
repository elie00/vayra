// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();

vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import { clearTmdbClientCache, get, setTmdbLanguage } from "./tmdb-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("tmdb-client pooled transport, cache and inflight dedupe", () => {
  beforeEach(() => {
    clearTmdbClientCache();
    setTmdbLanguage("");
    safeFetchMock.mockReset();
  });

  it("caches successful responses via safeFetch and normalizes parameter order", async () => {
    safeFetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 1 }] }));
    const a = await get<{ results: Array<{ id: number }> }>("key", "movie/popular", {
      region: "FR",
      page: "1",
    });
    const b = await get<{ results: Array<{ id: number }> }>("key", "movie/popular", {
      page: "1",
      region: "FR",
    });
    expect(a).toEqual({ results: [{ id: 1 }] });
    expect(b).toEqual({ results: [{ id: 1 }] });
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps cache entries separated by language", async () => {
    safeFetchMock
      .mockResolvedValueOnce(jsonResponse({ title: "English" }))
      .mockResolvedValueOnce(jsonResponse({ title: "Français" }));
    setTmdbLanguage("en-US");
    const en = await get<{ title: string }>("key", "movie/42");
    setTmdbLanguage("fr-FR");
    const fr = await get<{ title: string }>("key", "movie/42");
    expect(en?.title).toBe("English");
    expect(fr?.title).toBe("Français");
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent inflight requests to the same endpoint", async () => {
    let resolveFetch!: (res: Response) => void;
    safeFetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const p1 = get<{ ok: boolean }>("key", "trending/movie/week");
    const p2 = get<{ ok: boolean }>("key", "trending/movie/week");
    resolveFetch(jsonResponse({ ok: true }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("never caches failed responses and marks diagnostics on shared failure", async () => {
    safeFetchMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse({ id: 99 }));
    const d1 = { failed: false };
    const d2 = { failed: false };
    const [r1, r2] = await Promise.all([
      get<{ id: number }>("key", "movie/99", {}, d1),
      get<{ id: number }>("key", "movie/99", {}, d2),
    ]);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(d1.failed).toBe(true);
    expect(d2.failed).toBe(true);

    const retry = await get<{ id: number }>("key", "movie/99");
    expect(retry).toEqual({ id: 99 });
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });
});
