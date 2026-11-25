import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Addon } from "@/lib/addons";
import type { DebridStore } from "@/lib/debrid/types";

const safeFetchMock = vi.fn();
vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import { clearAddonStreamCache } from "./addons";
import { runPipeline } from "./pipeline";
import { invalidateUserAddonsCache, peekUserAddons, userAddonsCached } from "@/lib/addons";

beforeEach(() => {
  safeFetchMock.mockReset();
  clearAddonStreamCache();
  invalidateUserAddonsCache();
});

describe("stream pipeline & addon cache performance", () => {
  it("runs debrid listLibrary in parallel with addon stream fetch and calls listLibrary once", async () => {
    const events: string[] = [];
    let releaseLibrary!: () => void;
    const libraryGate = new Promise<void>((resolve) => {
      releaseLibrary = resolve;
    });

    const hash = "a".repeat(40);
    const listLibrary = vi.fn(async () => {
      events.push("library:start");
      await libraryGate;
      events.push("library:end");
      return {
        ok: true as const,
        data: [{ id: "1", slug: "rd" as const, name: "Example.Movie.2020.1080p.WEB-DL.mkv", hash }],
      };
    });

    const debrid: DebridStore = {
      slug: "rd",
      name: "Real-Debrid",
      account: vi.fn(),
      cacheCheck: vi.fn(async () => ({ ok: true as const, data: { [hash]: true } })),
      listLibrary,
      playableUrl: vi.fn(),
    };

    safeFetchMock.mockImplementation(async () => {
      events.push("addon:fetch");
      releaseLibrary();
      return new Response(
        JSON.stringify({
          streams: [
            {
              title: "Example.Movie.2020.1080p.WEB-DL.DDP5.1.x264-GRP",
              infoHash: hash,
              behaviorHints: { filename: "Example.Movie.2020.1080p.WEB-DL.mkv", videoSize: 3 * 1024 ** 3 },
            },
          ],
        }),
      );
    });

    const addon: Addon = {
      transportUrl: "https://fast.addon.test/manifest.json",
      manifest: {
        id: "fast.addon",
        name: "Fast Addon",
        resources: ["stream"],
        types: ["movie"],
        idPrefixes: ["tt"],
      },
    };

    const ac = new AbortController();
    const res = await runPipeline(
      {
        request: { type: "movie", ids: ["tt1234567"] },
        query: { type: "movie", imdbId: "tt1234567", title: "Example Movie", year: 2020 },
        addons: [addon],
        debrids: [debrid],
        trust: { kind: "movie", expectedTitle: "Example Movie", expectedYear: 2020 },
        score: { activeDebrids: ["rd"], mediaKind: "movie" },
      },
      ac.signal,
    );

    // Addon fetch must begin BEFORE libraryGate is released (proving concurrency).
    expect(events.indexOf("addon:fetch")).toBeLessThan(events.indexOf("library:end"));
    // listLibrary is fetched ONCE and reused for cross-checking cached hashes.
    expect(listLibrary).toHaveBeenCalledTimes(1);
    expect(res.picker.all.length).toBeGreaterThan(0);
    expect(res.picker.all[0].inLibrary.rd).toBe(true);
  });

  it("caches and deduplicates userAddonsCached lookups", async () => {
    safeFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            addons: [{ transportUrl: "https://a.test/manifest.json", manifest: { id: "a", name: "A" } }],
          },
        }),
      ),
    );
    const [first, second] = await Promise.all([
      userAddonsCached("key-1"),
      userAddonsCached("key-1"),
    ]);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(peekUserAddons("key-1")).toHaveLength(1);
  });
});
