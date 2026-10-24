import { beforeEach, expect, it, vi } from "vitest";

const installed = vi.hoisted(() => ({ list: [] as Array<{ id: string; transportUrl: string; installedAt: number; manifest: unknown }> }));
const fetchMock = vi.hoisted(() => vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}")));
vi.mock("@/lib/addon-store", () => ({
  loadInstalled: () => installed.list,
  filterEnabled: <T,>(items: T[]) => items,
}));
vi.mock("@/lib/auth", () => ({ readActiveStremioAuthKey: () => null }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: fetchMock }));

import { addonEventUrl, receivesWatchActivity, sendLibraryEvent, sendPlayerEvent } from "./addon-events";

const scrobbler = {
  id: "org.scrobbler",
  transportUrl: "https://scrobbler.example/abc/manifest.json",
  installedAt: 0,
  manifest: {
    id: "org.scrobbler",
    name: "Scrobbler",
    resources: [{ name: "player", types: ["movie", "series"], idPrefixes: ["tt"] }, "library"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
  },
};
const streams = {
  id: "org.streams",
  transportUrl: "https://streams.example/manifest.json",
  installedAt: 0,
  manifest: { id: "org.streams", name: "Streams", resources: ["stream"], types: ["movie", "series"] },
};

const urls = () => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  fetchMock.mockClear();
  installed.list = [scrobbler, streams];
});

it("tells only addons that declare the resource, times in milliseconds", async () => {
  await sendPlayerEvent("series", "tt0903747:1:2", "pause", 754.4, 2820);
  expect(urls()).toEqual([
    "https://scrobbler.example/abc/player/series/tt0903747%3A1%3A2/action=pause&currentTime=754400&duration=2820000.json",
  ]);
});

it("skips ids the addon does not handle", async () => {
  await sendPlayerEvent("movie", "kitsu:1", "start", 0, 0);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends library changes for a whole item or 100 videos per request", async () => {
  await sendLibraryEvent("movie", "tt0111161", "libraryAdd");
  const episodes = Array.from({ length: 250 }, (_, i) => `tt0903747:1:${i + 1}`);
  await sendLibraryEvent("series", "tt0903747", "watched", episodes);
  expect(urls()[0]).toBe("https://scrobbler.example/abc/library/movie/tt0111161/action=libraryAdd.json");
  expect(urls()).toHaveLength(4);
  expect(urls()[3]).toContain(`videoId=${encodeURIComponent(episodes.slice(200).join(","))}.json`);
});

it("flags addons that receive watch activity", () => {
  expect(receivesWatchActivity(scrobbler.manifest as never)).toBe(true);
  expect(receivesWatchActivity({ resources: [{ name: "library" }] } as never)).toBe(true);
  expect(receivesWatchActivity(streams.manifest as never)).toBe(false);
});

it("builds the URL from a transport URL with or without manifest.json", () => {
  expect(addonEventUrl("https://a.example/x/", "library", "movie", "tt1", [["action", "watched"]])).toBe(
    "https://a.example/x/library/movie/tt1/action=watched.json",
  );
});
