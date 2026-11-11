// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptySearchOutcome, SearchProvider, useSearch } from "./search-context";
import { searchAll, searchAnime, searchCinemeta, searchLiveTvChannels } from "./search";
import { searchAddonCatalogs, searchAddonGroups } from "./search-addons";
import { searchAddonIndex } from "./search-addon-index";
import type { SearchResults } from "./search";
import type { Meta } from "./cinemeta";

const settings = { tmdbKey: "test-key", iptvPlaylists: [] };
const hiddenTabs = { anime: false, liveTv: false };
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings }) }));
vi.mock("@/lib/parental", () => ({ useParental: () => ({ hiddenTabs }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ authKey: null }) }));
vi.mock("@/lib/addons", () => ({ gatherCatalogAddons: vi.fn().mockResolvedValue([]) }));
vi.mock("./search", () => ({
  searchAll: vi.fn(),
  searchAnime: vi.fn(),
  searchCinemeta: vi.fn(),
  searchLiveTvChannels: vi.fn().mockReturnValue([]),
  detectIntent: vi.fn().mockReturnValue(null),
}));
vi.mock("./search-addons", async (importOriginal) => ({
  ...await importOriginal<typeof import("./search-addons")>(),
  searchAddonCatalogs: vi.fn(),
  searchAddonGroups: vi.fn(),
}));
vi.mock("./search-addon-index", () => ({ searchAddonIndex: vi.fn().mockReturnValue([]) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function job() {
  return {
    main: deferred<SearchResults>(),
    anime: deferred<Awaited<ReturnType<typeof searchAnime>>>(),
    cine: deferred<Awaited<ReturnType<typeof searchCinemeta>>>(),
    catalogs: deferred<Awaited<ReturnType<typeof searchAddonCatalogs>>>(),
    groups: deferred<Awaited<ReturnType<typeof searchAddonGroups>>>(),
  };
}

const jobs = new Map<string, ReturnType<typeof job>>();
function forQuery(query: string) {
  if (!jobs.has(query)) jobs.set(query, job());
  return jobs.get(query)!;
}

function movie(id: string): Meta { return { id, type: "movie", name: id }; }
function result(query: string): SearchResults {
  const meta = movie(`${query}-main`);
  return {
    query, topMatch: { kind: "movie", meta, popularity: 1 }, movies: [meta],
    series: [], people: [], liveTv: [], anime: [], addonGroups: [], addons: [], intent: null,
  };
}

let root: Root | null;
let host: HTMLDivElement;
let latest: ReturnType<typeof useSearch>;
function Consumer() {
  latest = useSearch();
  return <output data-status={latest.status} data-query={latest.query}>
    {latest.results?.movies.map((meta) => <span key={meta.id}>{meta.name}</span>)}
  </output>;
}
async function type(query: string) { await act(async () => latest.setQuery(query)); }
async function tick(ms = 180) { await act(async () => vi.advanceTimersByTimeAsync(ms)); }
async function start(query: string) { await type(query); await tick(); return forQuery(query); }

beforeEach(async () => {
  jobs.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Search provider tests must not access the network"); }));
  localStorage.clear();
  vi.mocked(searchAll).mockImplementation((_key, query) => forQuery(query).main.promise);
  vi.mocked(searchAnime).mockImplementation((query) => forQuery(query).anime.promise);
  vi.mocked(searchCinemeta).mockImplementation((query) => forQuery(query).cine.promise);
  vi.mocked(searchAddonCatalogs).mockImplementation((_addons, query) => forQuery(query).catalogs.promise);
  vi.mocked(searchAddonGroups).mockImplementation((_addons, query) => forQuery(query).groups.promise);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<StrictMode><SearchProvider><Consumer /></SearchProvider></StrictMode>));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("debounces rapid typing and starts only the latest query", async () => {
  await type("d");
  await tick(100);
  await type("dark");
  await tick(179);
  expect(searchAll).not.toHaveBeenCalled();
  expect(latest.status).toBe("typing");
  await tick(1);
  expect(searchAll).toHaveBeenCalledTimes(1);
  expect(searchAll).toHaveBeenCalledWith("test-key", "dark", expect.objectContaining({ excludeGenres: [] }));
  expect(latest.status).toBe("loading");
  expect(searchLiveTvChannels).not.toHaveBeenCalled();
});

it("removes the old top match immediately and ignores late progressive results during new typing", async () => {
  const old = await start("old");
  await act(async () => old.main.resolve(result("old")));
  expect(host.textContent).toContain("old-main");
  expect(latest.results?.topMatch?.meta.id).toBe("old-main");

  await act(async () => {
    latest.setQuery("new");
    old.catalogs.resolve({ movies: [movie("old-addon")], series: [] });
  });
  expect(latest.query).toBe("new");
  expect(latest.status).toBe("typing");
  expect(latest.results).toBeNull();
  expect(host.textContent).toBe("");
  await tick(179);
  expect(latest.results).toBeNull();
  expect(searchAll).toHaveBeenCalledTimes(1);
});

it("invalidates a pending response before the replacement query debounce fires", async () => {
  const old = await start("old");
  const publications = vi.mocked(searchAddonIndex).mock.calls.length;
  await act(async () => {
    latest.setQuery("new");
    old.main.resolve(result("old"));
  });
  expect(latest.results).toBeNull();
  expect(latest.status).toBe("typing");
  expect(searchAddonIndex).toHaveBeenCalledTimes(publications);
});

it("never replaces newer results when all the older transports resolve out of order", async () => {
  const old = await start("old");
  const current = await start("new");
  await act(async () => current.main.resolve(result("new")));
  const publications = vi.mocked(searchAddonIndex).mock.calls.length;
  await act(async () => {
    old.main.resolve(result("old"));
    old.catalogs.resolve({ movies: [movie("old-addon")], series: [] });
    old.cine.resolve({ movies: [movie("old-cine")], series: [] });
    old.anime.resolve([]);
    old.groups.resolve([{ id: "old-group", name: "Old", metas: [movie("old-group-meta")] }]);
  });
  expect(latest.results?.query).toBe("new");
  expect(latest.results?.topMatch?.meta.id).toBe("new-main");
  expect(host.textContent).toBe("new-main");
  expect(searchAddonIndex).toHaveBeenCalledTimes(publications);
});

it("clearing invalidates in-flight responses and cancels queued work", async () => {
  const old = await start("old");
  const publications = vi.mocked(searchAddonIndex).mock.calls.length;
  await act(async () => {
    latest.clear();
    old.main.resolve(result("old"));
  });
  expect(latest).toMatchObject({ query: "", results: null, status: "idle" });
  expect(searchAddonIndex).toHaveBeenCalledTimes(publications);
  await type("queued");
  await act(async () => latest.clear());
  await tick(1000);
  expect(searchAll).toHaveBeenCalledTimes(1);
  expect(latest).toMatchObject({ query: "", results: null, status: "idle" });
});

it.each([false, true])("unmount cancels the debounce and blocks publications (already started: %s)", async (started) => {
  await type("unmounted");
  if (started) await tick();
  const publications = vi.mocked(searchAddonIndex).mock.calls.length;
  await act(async () => root!.unmount());
  root = null;
  if (started) await act(async () => forQuery("unmounted").main.resolve(result("unmounted")));
  await tick(1000);
  expect(searchAll).toHaveBeenCalledTimes(started ? 1 : 0);
  expect(searchAddonIndex).toHaveBeenCalledTimes(publications);
});

it("keeps progressive results and deduplicates secondary sources without replacing the top match", async () => {
  const current = await start("dark");
  await act(async () => current.main.resolve(result("dark")));
  expect(host.textContent).toBe("dark-main");
  await act(async () => current.groups.resolve([
    { id: "group", name: "Group", metas: [movie("extra"), movie("group-only")] },
  ]));
  expect(latest.results?.addonGroups[0].metas).toHaveLength(2);
  await act(async () => current.catalogs.resolve({ movies: [movie("dark-main"), movie("extra")], series: [] }));
  expect(latest.results?.movies.map((meta) => meta.id)).toEqual(["dark-main", "extra"]);
  expect(latest.results?.addonGroups[0].metas.map((meta) => meta.id)).toEqual(["group-only"]);
  await act(async () => current.cine.resolve({ movies: [movie("extra"), movie("cine")], series: [] }));
  await act(async () => current.anime.resolve([
    { malId: 1, name: "Anime", year: null, poster: null, background: null, overview: "", score: 0 },
  ]));
  expect(latest.results?.movies.map((meta) => meta.id)).toEqual(["dark-main", "extra", "cine"]);
  expect(latest.results?.anime[0].name).toBe("Anime");
  expect(latest.results?.topMatch?.meta.id).toBe("dark-main");
  expect(latest.status).toBe("done");
});

it("keeps valid catalog results when main and anime transports fail", async () => {
  const current = await start("dark");
  await act(async () => current.cine.resolve({ movies: [movie("cine")], series: [] }));
  await act(async () => {
    current.main.reject(new Error("TMDB unavailable"));
    current.anime.reject(new Error("Anime unavailable"));
  });
  expect(latest.results?.query).toBe("dark");
  expect(latest.results?.movies.map((meta) => meta.id)).toEqual(["cine"]);
  expect(latest.results?.topMatch).toBeNull();
  expect(latest.status).toBe("loading");
  await act(async () => current.catalogs.resolve({ movies: [movie("addon")], series: [] }));
  expect(latest.results?.movies.map((meta) => meta.id)).toEqual(["addon", "cine"]);
  await act(async () => current.groups.resolve([]));
  expect(latest.status).toBe("error");
  expect(latest.sources).toMatchObject({ tmdb: "error", anime: "error", cinemeta: "ready" });
});

it("does not strand a query when batched edits return to the same text", async () => {
  const old = await start("dark");
  await act(async () => {
    latest.clear();
    latest.setQuery("dark");
  });
  await tick();
  expect(searchAll).toHaveBeenCalledTimes(2);
  await act(async () => old.main.resolve(result("dark")));
  expect(latest.results?.query).toBe("dark");
  expect(latest.status).toBe("loading");
  await type("dark");
  await tick();
  expect(searchAll).toHaveBeenCalledTimes(2);
  expect(latest.status).toBe("loading");
});

const empty = (query: string): SearchResults => ({
  query, topMatch: null, movies: [], series: [], people: [], liveTv: [], anime: [], addonGroups: [], addons: [], intent: null,
});

it("reads an empty search as no match when one source is down but the others answered", async () => {
  const current = await start("zzqxwvkj");
  await act(async () => {
    current.main.resolve(empty("zzqxwvkj"));
    current.anime.reject(new Error("Anime unavailable"));
    current.cine.resolve({ movies: [], series: [] });
    current.catalogs.resolve({ movies: [], series: [] });
    current.groups.resolve([]);
  });
  expect(latest.status).toBe("error");
  expect(emptySearchOutcome(latest.status, latest.sources)).toBe("no-match");
});

it("reads an empty search as unavailable only when no source answered", async () => {
  const current = await start("dark");
  await act(async () => {
    current.main.reject(new Error("TMDB unavailable"));
    current.anime.reject(new Error("Anime unavailable"));
    current.cine.reject(new Error("Cinemeta unavailable"));
    current.catalogs.reject(new Error("Addons unavailable"));
    current.groups.reject(new Error("Addons unavailable"));
  });
  expect(latest.status).toBe("error");
  expect(emptySearchOutcome(latest.status, latest.sources)).toBe("unavailable");
});

it("has no empty-search outcome while sources are still pending", () => {
  expect(emptySearchOutcome("loading", { tmdb: "empty", anime: "pending" })).toBeNull();
  expect(emptySearchOutcome("done", { tmdb: "empty" })).toBe("no-match");
});

it("keeps pasted links and magnets out of the recent searches", async () => {
  await act(async () => {
    latest.recordRecent("https://debrid.example/dl/secret-token/film.mkv");
    latest.recordRecent("stremio://addon.example/manifest.json");
    latest.recordRecent("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567");
    latest.recordRecent("0123456789abcdef0123456789abcdef01234567");
    latest.recordRecent("dune");
  });
  expect(latest.recent).toEqual(["dune"]);
  expect(localStorage.getItem("harbor.search.recent")).toBe(JSON.stringify(["dune"]));
});

it("drops links saved in the recent searches by an earlier version", async () => {
  await act(async () => root!.unmount());
  localStorage.setItem("harbor.search.recent", JSON.stringify(["http://10.0.2.2:8765/test.mp4", "dune"]));
  root = createRoot(host);
  await act(async () => root!.render(<SearchProvider><Consumer /></SearchProvider>));
  expect(latest.recent).toEqual(["dune"]);
});
