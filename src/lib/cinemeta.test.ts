import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();

vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import { clearCinemetaCache, meta, topMovies } from "./cinemeta";

describe("cinemeta", () => {
  beforeEach(() => {
    clearCinemetaCache();
    safeFetchMock.mockReset();
  });

  it("reports an unreachable Cinemeta as a failed catalog instead of rejecting", async () => {
    // The Tauri HTTP plugin rejects with a bare string when the host is unreachable.
    safeFetchMock.mockRejectedValueOnce(
      "error sending request for url (https://v3-cinemeta.strem.io/catalog/movie/top.json)",
    );
    const diagnostics = { failed: false };
    await expect(topMovies(undefined, 0, diagnostics)).resolves.toEqual([]);
    expect(diagnostics.failed).toBe(true);
  });

  it("caches successful catalog and meta responses and deduplicates concurrent requests", async () => {
    let resolveCatalog!: (res: Response) => void;
    safeFetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveCatalog = resolve; }),
    );
    const p1 = topMovies("Action", 0);
    const p2 = topMovies("Action", 0);
    resolveCatalog(
      new Response(JSON.stringify({ metas: [{ id: "tt1", type: "movie", name: "Film 1" }] }), {
        status: 200,
      }),
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    const r3 = await topMovies("Action", 0);
    expect(r3).toHaveLength(1);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);

    safeFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: { id: "tt1", type: "movie", name: "Film 1" } }), {
        status: 200,
      }),
    );
    const m1 = await meta("movie", "tt1");
    const m2 = await meta("movie", "tt1");
    expect(m1?.name).toBe("Film 1");
    expect(m2?.name).toBe("Film 1");
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed catalogs so a retry can recover", async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response("err", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ metas: [{ id: "tt2", type: "movie", name: "Recovered" }] }), {
          status: 200,
        }),
      );
    const d1 = { failed: false };
    expect(await topMovies("Drama", 0, d1)).toEqual([]);
    expect(d1.failed).toBe(true);
    const d2 = { failed: false };
    const recovered = await topMovies("Drama", 0, d2);
    expect(recovered[0]?.name).toBe("Recovered");
    expect(d2.failed).toBe(false);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });
});
