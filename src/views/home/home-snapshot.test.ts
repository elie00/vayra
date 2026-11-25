// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT } from "@/lib/settings/defaults";
import type { Meta } from "@/lib/cinemeta";
import type { LibraryItem } from "@/lib/stremio";
import {
  clearHomeSnapshot,
  clearLibrarySnapshot,
  readHomeSnapshot,
  readLibrarySnapshot,
  writeHomeSnapshot,
  writeLibrarySnapshot,
} from "./home-snapshot";

describe("home SWR snapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips trimmed home rows and hero and re-attaches TMDB fetchers", () => {
    const settings = { ...DEFAULT, tmdbKey: "secret-key", homeMode: "harbor" as const };
    const rows = [
      {
        key: "tmdb-trending-movies",
        type: "movie" as const,
        name: "Trending This Week",
        metas: [{ id: "tmdb:movie:1", type: "movie" as const, name: "Dune", poster: "/p.jpg" }],
        page: 1,
        hasMore: true,
      },
    ];
    const hero: Meta[] = [
      { id: "tmdb:movie:1", type: "movie", name: "Dune", background: "/bg.jpg", description: "Arrakis" },
    ];
    writeHomeSnapshot(settings, "fr", rows, hero);

    // Must never persist the raw TMDB API key in localStorage.
    expect(localStorage.getItem("vayra.home.snapshot.v1")).not.toContain("secret-key");

    const restored = readHomeSnapshot(settings, "fr");
    expect(restored).not.toBeNull();
    expect(restored?.rows[0]?.metas[0]?.name).toBe("Dune");
    expect(restored?.rows[0]?.hasMore).toBe(true);
    expect(typeof restored?.rows[0]?.fetcher).toBe("function");
    expect(restored?.hero[0]?.description).toBe("Arrakis");

    // Scope mismatch returns null (language changed).
    expect(readHomeSnapshot(settings, "en")).toBeNull();
    clearHomeSnapshot();
    expect(readHomeSnapshot(settings, "fr")).toBeNull();
  });

  it("expires snapshots older than 12 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
    const settings = { ...DEFAULT, homeMode: "classic" as const };
    writeHomeSnapshot(
      settings,
      "fr",
      [{ key: "addon", type: "movie", name: "Addon", metas: [{ id: "tt1", type: "movie", name: "Film" }], page: 1, hasMore: false }],
      [],
    );
    expect(readHomeSnapshot(settings, "fr")).not.toBeNull();
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(readHomeSnapshot(settings, "fr")).toBeNull();
  });

  it("scopes library SWR snapshots by user id and clears cleanly on sign-out", () => {
    const items = [
      { _id: "tt1", type: "movie", name: "The Beast", removed: false, temp: false, _ctime: "", _mtime: "2026-11-25T09:00:00Z" },
    ] as LibraryItem[];
    writeLibrarySnapshot("user-a", items);
    expect(readLibrarySnapshot("user-a")).toHaveLength(1);
    expect(readLibrarySnapshot("user-b")).toBeNull();
    clearLibrarySnapshot();
    expect(readLibrarySnapshot("user-a")).toBeNull();
  });
});
