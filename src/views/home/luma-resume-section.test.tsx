// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LumaResumeEntry } from "@/lib/luma";
import { LumaResumeCard } from "./luma-resume-section";

const mocks = vi.hoisted(() => ({
  openMeta: vi.fn(),
  openPicker: vi.fn(),
  openPlayer: vi.fn(),
  openContextMenu: vi.fn(),
  clearResume: vi.fn(),
  fetchMeta: vi.fn(),
  resolveLogo: vi.fn(),
  peekCachedLogo: vi.fn(),
  resolveLumaResumeTarget: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? key.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : key,
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { tmdbKey: "test-key" } }),
}));
vi.mock("@/lib/view", () => ({
  useView: () => ({
    openMeta: mocks.openMeta,
    openPicker: mocks.openPicker,
    openPlayer: mocks.openPlayer,
  }),
}));
vi.mock("@/lib/context-menu", () => ({
  useContextMenu: () => ({ open: mocks.openContextMenu }),
}));
vi.mock("@/lib/luma", () => ({
  useLuma: () => ({ document: { preferences: { rememberActivity: true }, resumes: [] } }),
  lumaStore: () => ({ clearResume: mocks.clearResume }),
}));
vi.mock("@/lib/luma/resume-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/luma/resume-target")>();
  return {
    ...actual,
    resolveLumaResumeTarget: (...args: unknown[]) => mocks.resolveLumaResumeTarget(...args),
  };
});
vi.mock("@/lib/cinemeta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cinemeta")>();
  return { ...actual, meta: (...args: unknown[]) => mocks.fetchMeta(...args) };
});
vi.mock("@/lib/logo", () => ({
  peekCachedLogo: (...args: unknown[]) => mocks.peekCachedLogo(...args),
  resolveLogo: (...args: unknown[]) => mocks.resolveLogo(...args),
}));
vi.mock("@/lib/providers/anime-kitsu-addon", () => ({
  animeKitsuMeta: vi.fn(async () => null),
}));
vi.mock("@/lib/providers/tmdb/tmdb-lite", () => ({
  tmdbLiteMeta: vi.fn(async () => null),
}));

const catalogEntry: LumaResumeEntry = {
  id: "catalog:tt0131179",
  ref: {
    kind: "catalog",
    metaId: "tt0131179",
    mediaType: "series",
    episode: { season: 1, episode: 574, canonicalVideoId: "tt0131179:1:574" },
  },
  presentation: {
    title: "Detective Conan",
    artwork: "https://image.tmdb.org/t/p/w780/conan.jpg",
  },
  positionMs: 600_000,
  durationMs: 2_040_000,
  updatedAt: 1_700_000_000_000,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.cb([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
  mocks.fetchMeta.mockResolvedValue({
    id: "tt0131179",
    type: "series",
    name: "Detective Conan",
    background: "https://image.tmdb.org/t/p/w780/conan-bg.jpg",
  });
  mocks.peekCachedLogo.mockReturnValue("https://image.tmdb.org/t/p/w500/conan-logo.png");
  mocks.resolveLogo.mockResolvedValue(undefined);
  mocks.resolveLumaResumeTarget.mockReturnValue({
    kind: "catalog",
    meta: { id: "tt0131179", type: "series", name: "Detective Conan" },
    episode: { season: 1, episode: 574, videoId: "tt0131179:1:574" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("LumaResumeCard visual parity with ContinueCard", () => {
  it("matches ContinueCard layout: title below the 16:9 poster, centered logo, compact badge, and hover play", async () => {
    await act(async () => {
      root.render(<LumaResumeCard entry={catalogEntry} announce={vi.fn()} />);
    });

    const poster = host.querySelector(".harbor-poster")!;
    expect(poster).not.toBeNull();
    expect(poster.classList.contains("rounded-xl")).toBe(true);
    expect(poster.classList.contains("aspect-[16/9]")).toBe(true);

    // Title sits underneath the poster frame, never overlaid inside it.
    const titleBelow = host.querySelector("p");
    expect(titleBelow?.textContent).toBe("Detective Conan");
    expect(poster.textContent).not.toContain("Detective Conan");
    expect(poster.textContent).toContain("S1E574");
    expect(poster.textContent).toContain("24m left");

    // Official logo resolves and centers over the artwork.
    await vi.waitFor(() => {
      const imgs = [...poster.querySelectorAll("img")].map((i) => i.getAttribute("src"));
      expect(imgs).toContain("https://image.tmdb.org/t/p/w500/conan-logo.png");
    });

    // Clicking the card opens catalog detail; clicking the play overlay resumes directly.
    const buttons = host.querySelectorAll("button");
    await act(async () => buttons[0].click());
    expect(mocks.openMeta).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tt0131179", name: "Detective Conan" }),
      { episodeHint: { season: 1, episode: 574 } },
    );

    const playBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Resume Detective Conan with LUMA"]')!;
    await act(async () => playBtn.click());
    expect(mocks.openPicker).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tt0131179" }),
      expect.objectContaining({ season: 1, episode: 574 }),
      { autoPlay: true, resume: true },
    );
  });

  it("clears the entry from LUMA when dismissed", async () => {
    await act(async () => {
      root.render(<LumaResumeCard entry={catalogEntry} announce={vi.fn()} />);
    });
    const removeBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Detective Conan from LUMA history"]',
    )!;
    await act(async () => removeBtn.click());
    expect(mocks.clearResume).toHaveBeenCalledWith("catalog:tt0131179");
  });
});
