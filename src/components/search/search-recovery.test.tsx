// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { SearchOverlay } from "./search-overlay";
import { detectIntent, type SearchResults } from "@/lib/search";
import { SEARCH_TIMEOUT_MS } from "@/lib/request-outcome";
import fr from "@/lib/i18n/locales/fr";
import { searchRecovery } from "@/lib/i18n/locales/fr/search-recovery";

const fixture = vi.hoisted(() => ({
  settings: { tmdbKey: "fixture-only", iptvPlaylists: [], streaming: {} },
  hiddenTabs: { anime: false, liveTv: false },
  main: vi.fn(), anime: vi.fn(), cine: vi.fn(), catalogs: vi.fn(), groups: vi.fn(), openFilter: vi.fn(),
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: fixture.settings }) }));
vi.mock("@/lib/parental", () => ({ useParental: () => ({ hiddenTabs: fixture.hiddenTabs }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ authKey: null }) }));
vi.mock("@/lib/addons", () => ({ gatherCatalogAddons: async () => [] }));
vi.mock("@/lib/search-addon-index", () => ({ searchAddonIndex: () => [] }));
vi.mock("@/lib/search", async (original) => {
  const real = await original<typeof import("@/lib/search")>();
  return { ...real, searchAll: (...args: unknown[]) => fixture.main(...args), searchAnime: (...args: unknown[]) => fixture.anime(...args), searchCinemeta: (...args: unknown[]) => fixture.cine(...args), searchLiveTvChannels: () => [] };
});
vi.mock("@/lib/search-addons", async (original) => ({ ...await original<typeof import("@/lib/search-addons")>(), searchAddonCatalogs: (...args: unknown[]) => fixture.catalogs(...args), searchAddonGroups: (...args: unknown[]) => fixture.groups(...args) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string, vars?: Record<string, string | number>) => {
  let value = searchRecovery[key] ?? fr[key] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
} }));
vi.mock("@/lib/view", () => ({ useView: () => ({ openFilter: fixture.openFilter, openMeta: vi.fn() }) }));
vi.mock("./empty-state", () => ({ EmptyState: () => null }));
vi.mock("./anime-row", () => ({ AnimeRow: () => null }));
vi.mock("./guide-modal", () => ({ GuideModal: () => null }));
vi.mock("./live-tv-row", () => ({ LiveTvRow: () => null }));
vi.mock("./top-match", () => ({ TopMatch: () => null }));
vi.mock("./people-row", () => ({ PeopleRow: () => null }));
vi.mock("./meta-list", () => ({ MetaList: ({ items }: { items: Array<{ id: string; name: string }> }) => <div>{items.map((item) => <button key={item.id}>{item.name}</button>)}</div> }));
vi.mock("./addon-hits", () => ({ AddonHits: () => null }));
vi.mock("./addon-results", () => ({ AddonResults: () => null }));
vi.mock("./magnet-card", () => ({ MagnetCard: () => null }));
vi.mock("./url-card", () => ({ UrlCard: () => null }));
vi.mock("./ai-search-section", () => ({ AiSearchSection: () => null }));
vi.mock("./web-search-button", () => ({ WebSearchButton: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function empty(query: string): SearchResults {
  return { query, topMatch: null, movies: [], series: [], people: [], anime: [], liveTv: [], addons: [], addonGroups: [], intent: detectIntent(query) };
}
let root: Root;
let state: ReturnType<typeof useSearch>;
function Consumer() { state = useSearch(); return <SearchOverlay />; }
async function search(query: string) {
  await act(async () => { state.setOpen(true); state.setQuery(query); });
  await act(async () => vi.advanceTimersByTimeAsync(180));
}
const content = () => document.body.textContent ?? "";
const button = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label)!;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in search recovery tests"); }));
  localStorage.clear();
  fixture.main.mockImplementation(async (_key: string, query: string) => empty(query));
  fixture.anime.mockResolvedValue([]);
  fixture.cine.mockResolvedValue({ movies: [], series: [] });
  fixture.catalogs.mockResolvedValue({ movies: [], series: [] });
  fixture.groups.mockResolvedValue([]);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<SearchProvider><Consumer /></SearchProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for every source before announcing a genuinely empty search", async () => {
  const delayed = deferred<{ movies: []; series: [] }>();
  fixture.cine.mockReturnValue(delayed.promise);
  await search("Fixture");
  expect(state.status).toBe("loading");
  expect(state.sources.cinemeta).toBe("pending");
  const strayZero = () => Array.from(document.querySelectorAll("*")).flatMap((element) => Array.from(element.childNodes))
    .some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === "0");
  expect(strayZero()).toBe(false);
  expect(content()).not.toContain("Aucun résultat");
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => delayed.resolve({ movies: [], series: [] }));
  expect(state.status).toBe("done");
  expect(strayZero()).toBe(false);
  expect(content()).toContain(fr['No matches for "{query}"'].replace("{query}", "Fixture"));
});

it("shows progressive results before TMDB, retains them through a partial failure", async () => {
  const main = deferred<SearchResults>();
  fixture.main.mockReturnValue(main.promise);
  fixture.cine.mockResolvedValue({ movies: [{ id: "fixture", name: "Film disponible", type: "movie" }], series: [] });
  await search("Fixture");
  expect(content()).toContain("Film disponible");
  expect(content()).toContain("Recherche dans les autres sources");
  await act(async () => main.reject(new Error("Fixture failure")));
  expect(state.status).toBe("error");
  expect(content()).toContain("Film disponible");
  expect(content()).toContain("Certaines sources sont indisponibles");
});

it("announces total failure and retries the same query with keyboard focus restored", async () => {
  for (const mock of [fixture.main, fixture.anime, fixture.cine, fixture.catalogs, fixture.groups]) mock.mockRejectedValue(new Error("Fixture failure"));
  await search("Fixture");
  expect(state.status).toBe("error");
  expect(content()).not.toContain("Aucun résultat");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("La recherche n’a pas pu aboutir");
  fixture.main.mockImplementation(async (_key: string, query: string) => empty(query));
  fixture.anime.mockResolvedValue([]);
  fixture.cine.mockResolvedValue({ movies: [], series: [] });
  fixture.catalogs.mockResolvedValue({ movies: [], series: [] });
  fixture.groups.mockResolvedValue([]);
  await act(async () => { const retry = button("Réessayer la recherche"); retry.focus(); retry.click(); });
  expect(document.activeElement).toBe(document.querySelector("input"));
  expect(state.query).toBe("Fixture");
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(fixture.main).toHaveBeenCalledTimes(2);
  expect(state.status).toBe("done");
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it("bounds waiting, ignores a timed-out response, and can recover on retry", async () => {
  const delayed = deferred<{ movies: Array<{ id: string; name: string; type: string }>; series: [] }>();
  fixture.cine.mockReturnValue(delayed.promise);
  await search("Fixture");
  await act(async () => vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS));
  expect(state.status).toBe("error");
  await act(async () => delayed.resolve({ movies: [{ id: "late", name: "Must not appear", type: "movie" }], series: [] }));
  expect(content()).not.toContain("Must not appear");
  fixture.cine.mockResolvedValue({ movies: [], series: [] });
  await act(async () => button("Réessayer la recherche").click());
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(state.status).toBe("done");
});

it.each([["Horreur", "Horror", 27], ["Comédie", "Comedy", 35], ["Science-fiction", "Sci-Fi", 878]] as const)("recognizes typed French genre %s end to end", async (query, genre, id) => {
  await search(query);
  expect(state.results?.intent).toMatchObject({ kind: "genre", genre, mediaType: "movie" });
  const intentButton = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(`Films · ${query}`))!;
  expect(intentButton).toBeDefined();
  await act(async () => intentButton.click());
  expect(fixture.openFilter).toHaveBeenCalledWith({ kind: "genre", mediaType: "movie", name: genre, id });
  expect(state.open).toBe(false);
});

it("keeps English genres, years, accentless French and spacing normalization", () => {
  expect(detectIntent("  COMEDIE ")).toMatchObject({ genre: "Comedy" });
  expect(detectIntent("science   fiction")).toMatchObject({ genre: "Sci-Fi" });
  expect(detectIntent("films d’horreur")).toMatchObject({ genre: "Horror" });
  expect(detectIntent("Horror movies")).toMatchObject({ genre: "Horror" });
  expect(detectIntent("Comedy shows")).toMatchObject({ genre: "Comedy", mediaType: "tv" });
  expect(detectIntent("1972")).toMatchObject({ kind: "year", year: 1972 });
  expect(detectIntent("A title about horror")).toBeNull();
});
