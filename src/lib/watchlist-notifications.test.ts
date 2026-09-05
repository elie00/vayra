// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ readActiveStremioAuthKey: () => null }));
vi.mock("@/lib/stremio", () => ({}));
vi.mock("@/lib/trakt/watchlist", () => ({}));
vi.mock("@/lib/trakt/ids", () => ({}));
vi.mock("@/lib/simkl/watchlist", () => ({}));
vi.mock("@/lib/simkl/ids", () => ({}));
vi.mock("@/lib/simkl/session", () => ({}));

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

it("does not publish or persist an unchanged aggregate, including an empty list", async () => {
  const store = await import("./watchlist");
  const listener = vi.fn();
  const unsubscribe = store.subscribeWatchlist(listener);
  try {
    store.setWatchlistAggregate([]);
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem("harbor.watchlist.aggregate.v1")).toBeNull();
    store.setWatchlistAggregate(["tt1", "tt2"]);
    expect(listener).toHaveBeenCalledTimes(1);
    store.setWatchlistAggregate(["tt2", "tt1", "tt1"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("harbor.watchlist.aggregate.v1")!)).toEqual(["tt1", "tt2"]);
  } finally { unsubscribe(); }
});

it("notifies real membership changes, including clearing the last item", async () => {
  const store = await import("./watchlist");
  const listener = vi.fn();
  const unsubscribe = store.subscribeWatchlist(listener);
  try {
    store.setWatchlistAggregate(["tt1"]);
    expect(store.watchlistHas("tt1")).toBe(true);
    store.setWatchlistAggregate(["tt2"]);
    expect(store.watchlistHas("tt1")).toBe(false);
    expect(store.watchlistHas("tt2")).toBe(true);
    store.setWatchlistAggregate([]);
    expect(store.watchlistHas("tt2")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
  } finally { unsubscribe(); }
});

it("allows a subscriber to republish the same membership without recursion", async () => {
  const store = await import("./watchlist");
  let calls = 0;
  const unsubscribe = store.subscribeWatchlist(() => {
    if (++calls > 10) throw new Error("Watchlist notification feedback loop");
    store.setWatchlistAggregate(["tt1"]);
  });
  try {
    expect(() => store.setWatchlistAggregate(["tt1"])).not.toThrow();
    expect(calls).toBe(1);
  } finally { unsubscribe(); }
});

it("still publishes local title and artwork changes when membership stays the same", async () => {
  const store = await import("./watchlist");
  const listener = vi.fn();
  const unsubscribe = store.subscribeWatchlist(listener);
  try {
    store.addToWatchlist({ id: "tt1", type: "movie", name: "Old title", poster: "old.jpg" });
    store.addToWatchlist({ id: "tt1", type: "movie", name: "Titre français", poster: "fr.jpg" });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.readLocalEntries()).toEqual([expect.objectContaining({ id: "tt1", name: "Titre français", poster: "fr.jpg" })]);
  } finally { unsubscribe(); }
});
