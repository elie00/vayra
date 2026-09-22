// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fr from "@/lib/i18n/locales/fr";
import { SearchOverlay } from "./search-overlay";
import type { SearchResults } from "@/lib/search";

const state = vi.hoisted(() => ({
  query: "Dark", results: null as SearchResults | null,
  clear: vi.fn(), setOpen: vi.fn(), openMeta: vi.fn(), recordRecent: vi.fn(),
  discover: vi.fn<(...args: unknown[]) => Promise<never[]>>(async () => []),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string, vars?: Record<string, string | number>) => {
  let value = fr[key] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
} }));
vi.mock("@/lib/search-context", () => ({ useSearch: () => ({
  ...state, open: true, status: "done", recent: [], setQuery: vi.fn(),
}) }));
vi.mock("@/lib/view", () => ({ useView: () => ({ openMeta: state.openMeta, openFilter: vi.fn(), setView: vi.fn() }) }));
vi.mock("@/lib/parental", () => ({ useParental: () => ({ hiddenTabs: {} }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { streaming: {}, tmdbKey: "test-only", region: "FR" } }) }));
vi.mock("@/lib/surprise-me", () => ({ surpriseMe: vi.fn() }));
vi.mock("@/lib/providers/tmdb", () => ({ tmdbDiscover: (...args: unknown[]) => state.discover(...args) }));
vi.mock("@/components/pick-card", () => ({ PickCard: () => null }));
vi.mock("./anime-row", () => ({ AnimeRow: () => null }));
vi.mock("./guide-modal", () => ({ GuideModal: () => null }));
vi.mock("./live-tv-row", () => ({ LiveTvRow: () => null }));
vi.mock("./top-match", () => ({ TopMatch: () => null }));
vi.mock("./people-row", () => ({ PeopleRow: () => null }));
vi.mock("./meta-list", () => ({ MetaList: () => null }));
vi.mock("./addon-hits", () => ({ AddonHits: () => null }));
vi.mock("./addon-results", () => ({ AddonResults: () => null }));
vi.mock("./magnet-card", () => ({ MagnetCard: () => null }));
vi.mock("./url-card", () => ({ UrlCard: () => null }));
vi.mock("./ai-search-section", () => ({ AiSearchSection: ({ runSignal }: { runSignal: number }) => <div data-ai-run={runSignal} /> }));
vi.mock("./web-search-button", () => ({ WebSearchButton: () => null }));

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.query = "Dark";
  state.results = { query: "Dark", topMatch: { kind: "series", popularity: 1, meta: { id: "tt1", name: "Dark", type: "series" } }, people: [], movies: [], series: [], liveTv: [], anime: [], addons: [], addonGroups: [], intent: null };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() { await act(async () => root.render(<SearchOverlay />)); }
async function enter(options: KeyboardEventInit = {}) {
  await act(async () => document.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...options })));
}

it("opens only a current result with plain Enter", async () => {
  await mount();
  for (const options of [{ isComposing: true }, { repeat: true }, { metaKey: true }, { altKey: true }, { ctrlKey: true }]) await enter(options);
  expect(state.openMeta).not.toHaveBeenCalled();
  state.query = "Dark Matter";
  await mount();
  await enter();
  expect(state.openMeta).not.toHaveBeenCalled();
  state.query = "Dark";
  await mount();
  await enter();
  expect(state.openMeta).toHaveBeenCalledExactlyOnceWith(state.results!.topMatch!.meta);
  expect(state.setOpen).toHaveBeenCalledWith(false);
});

it("keeps Shift+Enter intentional and restores input focus after clearing", async () => {
  await mount();
  await enter({ shiftKey: true, isComposing: true });
  expect(document.querySelector("[data-ai-run]")!.getAttribute("data-ai-run")).toBe("0");
  await enter({ shiftKey: true });
  expect(document.querySelector("[data-ai-run]")!.getAttribute("data-ai-run")).toBe("1");
  expect(state.openMeta).not.toHaveBeenCalled();
  const clear = document.querySelector<HTMLButtonElement>(`button[aria-label="${fr.Clear}"]`)!;
  await act(async () => { clear.focus(); clear.click(); });
  expect(state.clear).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(document.querySelector("input"));
});

it("translates genre chips and headings without changing provider identifiers", async () => {
  state.query = "";
  state.results = null;
  await mount();
  const buttons = Array.from(document.querySelectorAll("button"));
  expect(buttons.some((b) => b.textContent === "Science-fiction")).toBe(true);
  expect(buttons.some((b) => b.textContent === "Fantastique")).toBe(true);
  const comedy = buttons.find((b) => b.textContent === "Comédie")!;
  await act(async () => comedy.click());
  expect(document.querySelector("h3")?.textContent).toBe("Comédie");
  expect(state.discover).toHaveBeenCalledWith("test-only", "movie", expect.objectContaining({ with_genres: "35" }));
  expect(document.body.textContent).toContain("Aucun titre trouvé pour Comédie");
});

it("translates the browse shortcut for years and genres", async () => {
  state.results!.intent = { kind: "year", year: 1972, label: "Movies from 1972" };
  await mount();
  expect(document.body.textContent).toContain("Films de 1972");
  state.results!.intent = { kind: "genre", genre: "Horror", mediaType: "movie", label: "Horror movies" };
  await mount();
  expect(document.body.textContent).toContain("Films · Horreur");
});
