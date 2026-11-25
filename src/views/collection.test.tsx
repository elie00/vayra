// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionView } from "./collection";
import { setWatchedFlag } from "@/lib/watched-flag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goBack = vi.fn();
const openCollections = vi.fn();
const openMeta = vi.fn();
const setView = vi.fn();

vi.mock("@/lib/view", () => ({
  useView: () => ({ goBack, openCollections, openMeta, setView }),
  useScrollMemory: () => {},
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { tmdbKey: "test-key" } }),
}));

vi.mock("@/lib/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/theme")>();
  return { ...actual, layoutHasGlobalBack: () => false };
});

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars
      ? Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key)
      : key,
}));

vi.mock("@/components/pick-card", () => ({
  PickCard: ({ meta }: { meta: { name: string } }) => <div data-testid="pick-card">{meta.name}</div>,
}));

const mockTmdbCollection = vi.fn();
const mockTmdbCollectionImages = vi.fn();

vi.mock("@/lib/providers/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tmdb")>();
  return {
    ...actual,
    peekTmdbCollection: () => null,
    peekCollectionArtwork: () => null,
    tmdbCollection: (...args: unknown[]) => mockTmdbCollection(...args),
    tmdbCollectionImages: (...args: unknown[]) => mockTmdbCollectionImages(...args),
  };
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  goBack.mockReset();
  openCollections.mockReset();
  openMeta.mockReset();
  setView.mockReset();
  mockTmdbCollection.mockReset();
  mockTmdbCollectionImages.mockReset();
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

describe("CollectionView", () => {
  it("shows saga progress, continues with next unwatched film, and toggles Timeline view", async () => {
    setWatchedFlag("tmdb:movie:120", true);
    mockTmdbCollection.mockResolvedValue({
      id: 119,
      name: "Le Seigneur des anneaux - Saga",
      displayName: "Le Seigneur des anneaux",
      overview: "L'épopée de la Terre du Milieu.",
      poster: "/lotr-poster.jpg",
      backdrop: "https://image.tmdb.org/t/p/w1280/lotr.jpg",
      cardBackdrop: "https://image.tmdb.org/t/p/w780/lotr.jpg",
      posterStack: ["/lotr1.jpg", "/lotr2.jpg", "/lotr3.jpg"],
      yearRange: "2001–2003",
      averageRating: "8.4",
      releasedCount: 2,
      parts: [
        {
          id: "tmdb:movie:120",
          type: "movie",
          name: "La Communauté de l'anneau",
          poster: "/lotr1.jpg",
          releaseInfo: "2001",
          releaseDate: "2001-12-19",
          imdbRating: "8.4",
          description: "Premier chapitre.",
        },
        {
          id: "tmdb:movie:121",
          type: "movie",
          name: "Les Deux Tours",
          poster: "/lotr2.jpg",
          releaseInfo: "2002",
          releaseDate: "2002-12-18",
          imdbRating: "8.3",
          description: "Deuxième chapitre.",
        },
      ],
    });
    mockTmdbCollectionImages.mockResolvedValue(null);

    await act(async () => {
      root = createRoot(host);
      root.render(<CollectionView collectionId={119} />);
    });
    await flush();

    expect(host.textContent).toContain("Le Seigneur des anneaux");
    expect(host.textContent).toContain("1/2 seen");
    expect(host.textContent).toContain("Continue: Les Deux Tours");

    const continueBtn = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue: Les Deux Tours"),
    );
    act(() => {
      continueBtn?.click();
    });
    expect(openMeta).toHaveBeenCalledWith(expect.objectContaining({ id: "tmdb:movie:121" }));

    const timelineBtn = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Timeline"),
    );
    act(() => {
      timelineBtn?.click();
    });
    expect(host.textContent).toContain("Premier chapitre.");
    expect(host.textContent).toContain("Watched");
  });

  it("renders a retry state when loading fails", async () => {
    mockTmdbCollection.mockResolvedValueOnce(null);
    await act(async () => {
      root = createRoot(host);
      root.render(<CollectionView collectionId={404} />);
    });
    await flush();

    expect(host.textContent).toContain("Couldn't load this collection right now.");
    expect(host.textContent).toContain("Retry");
  });
});
