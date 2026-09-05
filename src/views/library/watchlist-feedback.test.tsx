// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WatchlistTab } from "./watchlist-tab";
import { MacPersonalSections } from "../home/mac-personal-sections";
import {
  addToWatchlist,
  removeFromWatchlist,
  setWatchlistAggregate,
  subscribeWatchlist,
} from "@/lib/watchlist";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ authKey: null }),
  readActiveStremioAuthKey: () => null,
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: { posterScale: 1, rowTitleScale: 1, libraryBookmarkedOnly: false, librarySort: "recent" },
    update: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
const view = {
  rememberRowScroll: vi.fn(),
  recallRowScroll: () => 0,
  openPlayer: vi.fn(),
  setView: vi.fn(),
};
vi.mock("@/lib/view", () => ({ useView: () => view }));
vi.mock("@/lib/trakt/provider", () => ({ useTrakt: () => ({ isConnected: false }) }));
vi.mock("@/lib/trakt/watchlist", () => ({
  fetchWatchlist: vi.fn().mockResolvedValue([]),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
vi.mock("@/lib/trakt/ids", () => ({ stremioIdToTraktTarget: vi.fn() }));
vi.mock("@/lib/simkl/watchlist", () => ({ addToWatchlist: vi.fn(), removeFromWatchlist: vi.fn() }));
vi.mock("@/lib/simkl/ids", () => ({ stremioIdToSimklTarget: vi.fn() }));
vi.mock("@/lib/simkl/session", () => ({ isAuthenticated: () => false }));
vi.mock("@/lib/stremio", () => ({
  library: vi.fn().mockResolvedValue([]),
  libraryMetaType: (type: string) => type === "series" ? "series" : "movie",
  cloudWriteId: vi.fn(),
  saveStremioBookmark: vi.fn(),
  removeStremioBookmark: vi.fn(),
  removeStremioLibraryItem: vi.fn(),
}));
vi.mock("@/lib/luma", () => ({
  useLuma: () => ({ document: { preferences: { rememberActivity: true }, resumes: [] } }),
}));
vi.mock("@/lib/download/downloads-store", () => ({ useDownloads: () => [] }));
vi.mock("@/lib/download/offline-playback", () => ({ validatedDownloadSource: vi.fn() }));
vi.mock("@/components/pick-card", () => ({
  PickCard: ({ meta }: { meta: { name: string } }) => <span>{meta.name}</span>,
}));
vi.mock("@/components/continue-card", () => ({ ContinueCard: () => null }));
vi.mock("../home/luma-resume-section", () => ({ LumaResumeCard: () => null }));
vi.mock("./watchlist-card", () => ({
  WatchlistCard: ({ meta }: { meta: { name: string } }) => <span>{meta.name}</span>,
}));
vi.mock("./hydrate-meta", () => ({ hydrateLibraryMeta: vi.fn(), loadLocalIds: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  setWatchlistAggregate([]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1800);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])("opening the library with retained Mac home settles and keeps local edits live (saved title: %s)", async (seedTitle) => {
  if (seedTitle) addToWatchlist({ id: "tt123", type: "movie", name: "Saved title" });
  const host = document.createElement("div");
  const root = createRoot(host);
  let notifications = 0;
  const unsubscribe = subscribeWatchlist(() => {
    // A passive-effect-only regression can otherwise keep act() running forever
    // in development React. This is a failure guard, not part of the store mock:
    // both screens below use the real watchlist read/write/subscription functions.
    if (++notifications > 20) throw new Error("Watchlist aggregate feedback loop");
  });
  try {
    await act(async () => root.render(<>
      <div data-testid="retained-home"><MacPersonalSections items={[]} libraryItems={[]} onDismiss={() => {}} /></div>
      <div data-testid="library"><WatchlistTab /></div>
    </>));
    expect(notifications).toBeLessThanOrEqual(1);
    expect(host.querySelector(".harbor-row-track")).not.toBeNull();

    await act(async () => addToWatchlist({ id: "tt456", type: "movie", name: "New saved title" }));
    expect(host.querySelector('[data-testid="retained-home"]')?.textContent).toContain("New saved title");
    expect(host.querySelector('[data-testid="library"]')?.textContent).toContain("New saved title");

    await act(async () => removeFromWatchlist("tt456"));
    expect(host.textContent).not.toContain("New saved title");
    expect(notifications).toBeLessThanOrEqual(5);
  } finally {
    await act(async () => root.unmount());
    unsubscribe();
  }
});
