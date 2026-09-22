// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Home } from "../home";
import { DEFAULT } from "@/lib/settings/defaults";
import type { Settings } from "@/lib/settings";
import type { HomeRow } from "./home-types";
import type { AddonRow } from "@/lib/addons";
import type { CustomList } from "@/lib/custom-lists";
import { HOME_CATALOG_TIMEOUT_MS } from "@/lib/request-outcome";
import { searchRecovery } from "@/lib/i18n/locales/fr/search-recovery";

const fixture = vi.hoisted(() => ({
  settings: {} as Settings, lists: [] as CustomList[], load: vi.fn(), build: vi.fn(),
  emptyMap: new Map(), empty: [], disconnected: { isConnected: false }, letterboxd: { isActive: false },
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: fixture.settings, update: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ authKey: null, user: null }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => searchRecovery[key] ?? key, t: (key: string) => searchRecovery[key] ?? key, useUiLanguage: () => "fr" }));
vi.mock("@/lib/addons", () => ({
  loadAddonRows: (...args: unknown[]) => fixture.load(...args), hasTmdbProviderAddon: () => false,
  userAddons: vi.fn(), createAddonCatalogFetcher: vi.fn(), normalizeName: (name: string) => name,
}));
vi.mock("./home-rows", async (original) => ({ ...await original<typeof import("./home-rows")>(), buildTmdbRows: (...args: unknown[]) => fixture.build(...args), buildCinemetaRows: (...args: unknown[]) => fixture.build(...args), buildAnimeHomeRows: async () => [] }));
vi.mock("@/lib/custom-lists", () => ({ useCustomLists: () => fixture.lists }));
vi.mock("@/lib/trakt/provider", () => ({ useTrakt: () => fixture.disconnected }));
vi.mock("@/lib/simkl/provider", () => ({ useSimkl: () => fixture.disconnected }));
vi.mock("@/lib/anilist/provider", () => ({ useAnilist: () => fixture.disconnected }));
vi.mock("@/lib/stremboxd/provider", () => ({ useLetterboxd: () => fixture.letterboxd }));
vi.mock("@/lib/media-favorites", () => ({ useMediaFavorites: () => ({ items: fixture.emptyMap }) }));
vi.mock("@/lib/local-watchlist", () => ({ useLocalWatchlist: () => ({ items: fixture.emptyMap }) }));
vi.mock("@/lib/playback-history", () => ({ recentlyPlayed: () => new Set(), subscribePlayback: () => () => {} }));
vi.mock("@/lib/local-cw", () => ({ listLocalCw: () => fixture.empty, clearLocalCw: vi.fn(), subscribeLocalCw: () => () => {}, localCwVersion: () => 0 }));
vi.mock("@/lib/manual-watched", () => ({ manualWatchedLibraryItems: () => fixture.empty, dismissManualWatched: vi.fn(), subscribeManualWatched: () => () => {}, manualWatchedVersion: () => 0 }));
vi.mock("@/lib/anime-detect", () => ({ useDetectedAnimeVersion: () => 0, detectAnimeForCw: vi.fn() }));
vi.mock("@/lib/cw-dismiss", () => ({ useCwDismissVersion: () => 0, isCwDismissed: () => false, dismissCw: vi.fn() }));
vi.mock("@/lib/hover-preview/store", () => ({ publishResumeStates: vi.fn() }));
vi.mock("@/lib/view", () => ({ useScrollMemory: vi.fn(), useView: () => ({ homeResetTick: 0 }) }));
vi.mock("@/lib/platform", async (original) => ({ ...await original<typeof import("@/lib/platform")>(), isMacDesktop: () => true, isMobileTauri: () => false }));
vi.mock("@/views/anime", () => ({ isAnimeRow: () => false }));
vi.mock("./hooks/use-cw-advance", () => ({ useCwAdvance: () => fixture.empty }));
vi.mock("./hooks/use-pinned-rows", () => ({ usePinnedRows: () => fixture.empty }));
vi.mock("@/components/back-to-top", () => ({ BackToTop: () => null }));
vi.mock("@/components/hero-carousel", () => ({ HeroCarousel: () => null }));
vi.mock("@/components/collections-row", () => ({ CollectionsRow: () => null }));
vi.mock("@/components/nudge", () => ({ TmdbNudge: () => null }));
vi.mock("@/components/row", async () => ({ Row: ({ children }: { children: ReactNode }) => <div>{children}</div>, ScrollRootContext: (await import("react")).createContext(null) }));
vi.mock("@/components/streaming-rail", () => ({ StreamingRail: () => null }));
vi.mock("@/components/top-rank-card", () => ({ TopRankCard: () => null }));
vi.mock("@/components/add-source-modal", () => ({ AddSourceModal: () => null }));
vi.mock("./customize-bar", () => ({ CustomizeBar: () => null }));
vi.mock("./cw-section", () => ({ CWSection: () => null }));
vi.mock("./mac-personal-sections", () => ({ MacPersonalSections: () => <h1>Accueil personnel</h1> }));
vi.mock("./mac-discovery-banner", () => ({ MacDiscoveryBanner: () => null }));
vi.mock("./luma-resume-section", () => ({ LumaResumeSection: () => null }));
vi.mock("@/mobile/home", () => ({ MobileHome: () => null }));
vi.mock("./row-skeleton", () => ({ RowSkeleton: () => <div data-skeleton="" /> }));
vi.mock("./customizable-rows", () => ({ CustomizableRows: ({ rows }: { rows: HomeRow[] }) => <section>{rows.map((row) => <article key={row.key}><h2>{row.name}</h2>{row.metas.map((meta) => <button key={meta.id}>{meta.name}</button>)}</article>)}</section> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let root: Root;
let host: HTMLDivElement;
let request: ReturnType<typeof deferred<AddonRow[]>>;
const content = () => host.textContent ?? "";
async function mount() { await act(async () => root.render(<Home />)); }
async function retry() {
  await act(async () => Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Réessayer les catalogues")!.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Home recovery tests must not use the network"); }));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  fixture.settings = { ...DEFAULT, homeMode: "classic", hideContent: { ...DEFAULT.hideContent, anime: true }, homeRows: { ...DEFAULT.homeRows, listRows: ["fixture-list"], customSources: [{ id: "fixture-source", title: "Source locale", folders: [{ id: "fixture-folder", title: "Dossier local", coverImageUrl: null, focusGifUrl: null, tileShape: "LANDSCAPE" }] }] } };
  fixture.lists = [{ id: "fixture-list", name: "Liste locale", createdAt: 0, updatedAt: 0, items: [{ id: "fixture-film", type: "movie", name: "Film local", addedAt: 0 }] }];
  request = deferred<AddonRow[]>();
  fixture.load.mockReturnValue(request.promise);
  fixture.build.mockResolvedValue({ rows: [], hero: [] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("renders local lists and custom sources while remote catalogs are pending and after failure", async () => {
  await mount();
  expect(content()).toContain("Film local");
  expect(content()).toContain("Source locale");
  expect(content()).toContain("Chargement des catalogues");
  expect(host.querySelector("[data-skeleton]")).toBeNull();
  await act(async () => request.reject(new Error("Fixture offline")));
  expect(content()).toContain("Film local");
  expect(content()).toContain("Source locale");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("n’ont pas pu être chargés");
  expect(content()).not.toContain("Chargement des catalogues");
});

it.each([false, true])("ends an empty remote catalog load instead of keeping skeletons (local rows: %s)", async (local) => {
  if (!local) {
    fixture.settings.homeRows = { ...fixture.settings.homeRows, listRows: [], customSources: [] };
    fixture.lists = [];
  }
  await mount();
  expect(host.querySelectorAll("[data-skeleton]")).toHaveLength(local ? 0 : 3);
  await act(async () => request.resolve([]));
  expect(host.querySelector("[data-skeleton]")).toBeNull();
  expect(content()).toContain(local ? "Film local" : "Aucun catalogue à afficher");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("ends a failed load with no local data in an actionable error, not a permanent skeleton", async () => {
  fixture.settings.homeRows = { ...fixture.settings.homeRows, listRows: [], customSources: [] };
  fixture.lists = [];
  await mount();
  await act(async () => request.reject(new Error("Fixture offline")));
  expect(host.querySelector("[data-skeleton]")).toBeNull();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(content()).toContain("Réessayer les catalogues");
  expect(content()).not.toContain("Aucun catalogue à afficher");
});

it("retries failed catalogs without modifying local rows or settings", async () => {
  await mount();
  await act(async () => request.reject(new Error("Fixture offline")));
  fixture.load.mockResolvedValue([{ key: "remote", type: "movie", name: "Catalogue rétabli", metas: [{ id: "remote-film", type: "movie", name: "Film distant" }] }]);
  await retry();
  expect(fixture.load).toHaveBeenCalledTimes(2);
  expect(content()).toContain("Film local");
  expect(content()).toContain("Film distant");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("bounds a never-resolving load and ignores old results after a successful retry", async () => {
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(HOME_CATALOG_TIMEOUT_MS));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(content()).not.toContain("Chargement des catalogues");
  fixture.load.mockResolvedValue([]);
  await retry();
  await act(async () => request.resolve([{ key: "late", type: "movie", name: "Must not appear", metas: [{ id: "late-film", type: "movie", name: "Late" }] }]));
  expect(content()).not.toContain("Must not appear");
  expect(content()).toContain("Film local");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("surfaces handled catalog diagnostics and preserves initial built rows", async () => {
  fixture.settings = { ...fixture.settings, homeMode: "harbor", tmdbKey: "fixture-only" };
  fixture.build.mockImplementation(async (_settings, diagnostics) => {
    diagnostics.failed = true;
    return { rows: [
      { key: "top", type: "movie", name: "Top", metas: Array.from({ length: 10 }, (_, i) => ({ id: `top-${i}`, name: `Film ${i}`, type: "movie" })), page: 1, hasMore: false },
      { key: "built", type: "movie", name: "Catalogue partiel", metas: [{ id: "built-film", name: "Film disponible", type: "movie" }], page: 1, hasMore: false, noDedup: true },
    ], hero: [] };
  });
  fixture.load.mockResolvedValue([]);
  await mount();
  expect(content()).toContain("Catalogue partiel");
  expect(content()).toContain("Film local");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
