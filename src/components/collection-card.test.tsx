// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionCard } from "./collection-card";
import { setWatchedFlag } from "@/lib/watched-flag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openCollection = vi.fn();

vi.mock("@/lib/view", () => ({
  useView: () => ({ openCollection }),
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { tmdbKey: "test-key" } }),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars
      ? Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key)
      : key,
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
    tmdbSearchCollectionId: vi.fn(async () => null),
  };
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  openCollection.mockReset();
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

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CollectionCard", () => {
  it("renders curated artwork, cleaned localized title, poster fan, metadata and watched progress", async () => {
    setWatchedFlag("tmdb:movie:120", true);
    mockTmdbCollection.mockResolvedValue({
      id: 119,
      name: "Le Seigneur des anneaux - Saga",
      displayName: "Le Seigneur des anneaux",
      overview: "La quête de l'Anneau.",
      cardBackdrop: "https://image.tmdb.org/t/p/w780/default.jpg",
      backdrop: "https://image.tmdb.org/t/p/w1280/default.jpg",
      posterStack: ["/p1.jpg", "/p2.jpg", "/p3.jpg"],
      yearRange: "2001–2003",
      averageRating: "8.4",
      releasedCount: 3,
      parts: [
        { id: "tmdb:movie:120", type: "movie", name: "Part 1", releaseDate: "2001-12-19" },
        { id: "tmdb:movie:121", type: "movie", name: "Part 2", releaseDate: "2002-12-18" },
        { id: "tmdb:movie:122", type: "movie", name: "Part 3", releaseDate: "2003-12-17" },
      ],
    });
    mockTmdbCollectionImages.mockResolvedValue({
      cardBackdrop: "https://image.tmdb.org/t/p/w780/clean-textless.jpg",
      heroBackdrop: "https://image.tmdb.org/t/p/w1280/clean-textless.jpg",
      posters: [],
    });

    await act(async () => {
      root = createRoot(host);
      root.render(<CollectionCard id={119} name="The Lord of the Rings" />);
    });
    await flushMicrotasks();

    const text = host.textContent ?? "";
    expect(text).toContain("Le Seigneur des anneaux");
    expect(text).toContain("3 films");
    expect(text).toContain("2001–2003");
    expect(text).toContain("8.4");
    expect(text).toContain("1/3 seen");

    const imgs = [...host.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(imgs).toContain("https://image.tmdb.org/t/p/w780/clean-textless.jpg");
    expect(imgs).toContain("/p1.jpg");
    expect(imgs).toContain("/p2.jpg");
    expect(imgs).toContain("/p3.jpg");

    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(openCollection).toHaveBeenCalledWith(119);
  });
});
