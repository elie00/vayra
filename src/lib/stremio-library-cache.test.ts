import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: fetchMock }));

import { invalidateStremioLibraryCache, library, libraryPut, type LibraryItem } from "./stremio";

function jsonResult(result: unknown) {
  return { json: async () => ({ result }) };
}

describe("stremio library cache and inflight deduplication", () => {
  beforeEach(() => {
    invalidateStremioLibraryCache();
    fetchMock.mockReset();
  });

  it("deduplicates concurrent library() calls and serves subsequent calls from short TTL cache", async () => {
    let resolveMeta!: (v: unknown) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise((r) => { resolveMeta = r; }))
      .mockResolvedValueOnce(jsonResult([{ _id: "tt1", name: "Film" }]));

    const p1 = library("auth-1");
    const p2 = library("auth-1");
    resolveMeta(jsonResult([["tt1", "2026-01-01"]]));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const r3 = await library("auth-1");
    expect(r3).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cached library after libraryPut succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResult([["tt1", "2026-01-01"]]))
      .mockResolvedValueOnce(jsonResult([{ _id: "tt1", name: "Old" }]))
      .mockResolvedValueOnce(jsonResult({ success: true }))
      .mockResolvedValueOnce(jsonResult([["tt1", "2026-01-02"]]))
      .mockResolvedValueOnce(jsonResult([{ _id: "tt1", name: "Updated" }]));

    const first = await library("auth-2");
    expect(first[0]?.name).toBe("Old");

    await libraryPut("auth-2", { _id: "tt1", name: "Updated" } as unknown as LibraryItem);

    const second = await library("auth-2");
    expect(second[0]?.name).toBe("Updated");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
