// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionsView } from "./collections";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goBack = vi.fn();
const setView = vi.fn();
const openCollection = vi.fn();
const openMeta = vi.fn();
let mockTmdbKey = "test-key";

vi.mock("@/lib/view", () => ({
  useView: () => ({ goBack, setView, openCollection, openMeta }),
  useScrollMemory: () => {},
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { tmdbKey: mockTmdbKey } }),
}));

vi.mock("@/lib/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/theme")>();
  return {
    ...actual,
    layoutHasGlobalBack: () => false,
  };
});

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars
      ? Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key)
      : key,
}));

vi.mock("@/lib/providers/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tmdb")>();
  return {
    ...actual,
    peekTmdbCollection: () => null,
    peekCollectionArtwork: () => null,
    tmdbCollection: vi.fn(async (_key: string, id: number) => ({
      id,
      name: `Saga ${id} Collection`,
      displayName: `Saga ${id}`,
      overview: "Une saga emblématique.",
      backdrop: `https://image.tmdb.org/t/p/w1280/hero-${id}.jpg`,
      cardBackdrop: `https://image.tmdb.org/t/p/w780/card-${id}.jpg`,
      posterStack: [`/p-${id}-1.jpg`, `/p-${id}-2.jpg`],
      yearRange: "2001–2003",
      averageRating: "8.2",
      releasedCount: 2,
      parts: [
        { id: `tmdb:movie:${id}1`, type: "movie", name: `Film ${id}-1`, poster: `/p-${id}-1.jpg`, releaseDate: "2001-01-01" },
        { id: `tmdb:movie:${id}2`, type: "movie", name: `Film ${id}-2`, poster: `/p-${id}-2.jpg`, releaseDate: "2003-01-01" },
      ],
    })),
    tmdbCollectionImages: vi.fn(async () => null),
    tmdbSearchCollectionId: vi.fn(async () => null),
    tmdbSearchCollections: vi.fn(async () => ({ hits: [], totalPages: 0 })),
  };
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  mockTmdbKey = "test-key";
  goBack.mockReset();
  setView.mockReset();
  openCollection.mockReset();
  openMeta.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host.remove();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CollectionsView", () => {
  it("renders VAYRA featured saga stage, sort toggle and category filters", async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(<CollectionsView />);
    });
    await flush();

    expect(host.textContent).toContain("VAYRA Anthology");
    expect(host.textContent).toContain("Featured saga");
    expect(host.textContent).toContain("Explore saga");
    expect(host.textContent).toContain("VAYRA Selection");

    const alphaBtn = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("A–Z"));
    expect(alphaBtn).toBeTruthy();
    act(() => {
      alphaBtn?.click();
    });
    expect(alphaBtn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("offers direct navigation to Settings when TMDB key is missing", async () => {
    mockTmdbKey = "";
    await act(async () => {
      root = createRoot(host);
      root.render(<CollectionsView />);
    });
    await flush();

    const settingsBtn = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Open Settings"),
    );
    expect(settingsBtn).toBeTruthy();
    act(() => {
      settingsBtn?.click();
    });
    expect(setView).toHaveBeenCalledWith("settings");
  });
});
