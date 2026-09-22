// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DownloadItem } from "@/lib/download/downloads-store";
import type { PlayerSrc } from "@/lib/view";
import { validatedDownloadSource } from "@/lib/download/offline-playback";
import { MacPersonalSections } from "./mac-personal-sections";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { posterScale: 1, rowTitleScale: 1, libraryBookmarkedOnly: false } }),
}));
const view = { openPlayer: vi.fn(), setView: vi.fn(), rememberRowScroll: vi.fn(), recallRowScroll: () => 0 };
vi.mock("@/lib/view", () => ({ useView: () => view }));
vi.mock("@/lib/luma", () => ({
  useLuma: () => ({ document: { preferences: { rememberActivity: true }, resumes: [] } }),
}));
vi.mock("@/lib/trakt/provider", () => ({ useTrakt: () => ({ isConnected: false }) }));
vi.mock("@/lib/trakt/watchlist", () => ({ fetchWatchlist: vi.fn() }));
vi.mock("@/lib/watchlist", () => ({ readLocalEntries: () => [], subscribeWatchlist: () => () => {} }));
vi.mock("@/lib/watchlist-merge", () => ({ filterLibrary: () => [], mergeWatchlist: () => [] }));
vi.mock("@/components/pick-card", () => ({ PickCard: () => null }));
vi.mock("@/components/continue-card", () => ({ ContinueCard: () => null }));
vi.mock("./luma-resume-section", () => ({ LumaResumeCard: () => null }));
vi.mock("@/lib/download/offline-playback", () => ({ validatedDownloadSource: vi.fn() }));
let downloads: DownloadItem[];
vi.mock("@/lib/download/downloads-store", () => ({ useDownloads: () => downloads }));

function download(id: string, title: string, overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id, metaId: id, title, subtitle: "S1 · E01", poster: `/posters/${id}.jpg`,
    season: 1, episode: 1, streamLabel: null, url: "https://example.test/video",
    path: `/downloads/${id}.mkv`, status: "done", receivedBytes: 1024,
    totalBytes: 1024, ratio: 1, bytesPerSec: 0, error: null, startedAt: 1,
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: Root;
let availableWidth: number;
const intersections: (() => void)[] = [];
const resizes: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resizes.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      intersections.push(() => callback([{ isIntersecting: true }]));
    }
    observe() {}
    disconnect() {}
  });
  availableWidth = 1380;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => availableWidth);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(2000);
  downloads = [
    download("short", "Dark Matter"),
    download("movie", "Perfect Blue", { subtitle: "1998", season: null, episode: null }),
    download("subtitle", "MobLand", { subtitle: "S1 · E10 · " + "A long episode subtitle ".repeat(10) }),
    download("long", "Star Wars: Visions Presents - The Ninth Jedi"),
    download("unbroken", "A".repeat(200)),
    download("no-poster", "Without an image", { poster: null, subtitle: null }),
    download("lazy", "A later offline card with a long title"),
    download("unfinished", "Not ready to watch", { status: "paused" }),
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  intersections.length = 0;
  resizes.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderHome() {
  await act(async () => root.render(<MacPersonalSections items={[]} libraryItems={[]} onDismiss={() => {}} />));
  return host.querySelectorAll<HTMLDivElement>(".harbor-row-track")[1];
}

it("keeps one size contract for short, long, unbroken and missing-artwork offline cards", async () => {
  const track = await renderHome();
  const cards = Array.from(track.querySelectorAll("button"));
  expect(cards).toHaveLength(6);
  for (const [index, card] of cards.entries()) {
    // jsdom does not perform layout. Lock the actual Tailwind layout contract;
    // rendered dimensions must also be checked in the installed macOS app.
    expect(card.classList.contains("w-full")).toBe(true);
    expect(card.classList.contains("h-28")).toBe(true);
    expect(card.classList.contains("min-w-0")).toBe(true);
    expect(card.classList.contains("min-h-28")).toBe(false);
    const poster = card.children[0];
    for (const token of ["h-20", "w-14", "shrink-0"]) expect(poster.classList.contains(token)).toBe(true);
    expect(poster.getAttribute("aria-hidden")).toBe("true");
    const text = card.children[1];
    expect(text.classList.contains("min-w-0")).toBe(true);
    expect(text.children[0].classList.contains("line-clamp-2")).toBe(true);
    expect(text.children[0].classList.contains("break-words")).toBe(true);
    expect(text.children[1].classList.contains("truncate")).toBe(true);
    expect(text.children[0].textContent).toBe(downloads[index].title);
    expect(card.title).toBe(`${downloads[index].title}\n${downloads[index].subtitle || "Watch offline"}`);
  }
  expect(cards[5].children[0].querySelector("svg")).not.toBeNull();
  expect(host.textContent).not.toContain("Not ready to watch");
});

it("uses the same footprint for lazy placeholders and loaded cards, including after resize", async () => {
  const track = await renderHome();
  const placeholder = track.children[6].firstElementChild!;
  expect((track.children[6] as HTMLElement).style.containIntrinsicSize).toBe("auto 7rem");
  expect(placeholder.classList.contains("h-28")).toBe(true);
  expect(placeholder.classList.contains("w-full")).toBe(true);
  await act(async () => intersections.forEach((intersect) => intersect()));
  expect(track.children[6].querySelector("button")?.classList.contains("h-28")).toBe(true);
  for (const width of [600, 900, 1380]) {
    availableWidth = width;
    await act(async () => {
      resizes.forEach((resize) => resize());
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const columns = Math.max(1, Math.floor((width + 20) / 260));
    expect(track.style.gridAutoColumns).toBe(`${(width - (columns - 1) * 20) / columns}px`);
    for (const card of track.querySelectorAll("button")) {
      expect(card.classList.contains("w-full")).toBe(true);
      expect(card.classList.contains("h-28")).toBe(true);
    }
  }
});

it("still validates an offline file before opening the player", async () => {
  const track = await renderHome();
  const source: PlayerSrc = {
    meta: { id: downloads[0].metaId, name: downloads[0].title, type: "series" },
    url: downloads[0].path, title: downloads[0].title, resume: true,
  };
  vi.mocked(validatedDownloadSource).mockResolvedValue(source);
  await act(async () => track.querySelector("button")!.click());
  expect(validatedDownloadSource).toHaveBeenCalledWith(downloads[0]);
  expect(view.openPlayer).toHaveBeenCalledWith(source);
});

it("keeps invalid offline files out of the player and announces the problem", async () => {
  const track = await renderHome();
  vi.mocked(validatedDownloadSource).mockResolvedValue(null);
  await act(async () => track.querySelector("button")!.click());
  expect(view.openPlayer).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("This file is missing or incomplete. Download it again from the title page.");
});
