// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadItem } from "@/lib/download/downloads-store";
import { LibraryView } from "../library";

const mocks = vi.hoisted(() => ({
  view: "downloads" as "library" | "downloads",
  unified: true,
  setView: vi.fn(),
  openStats: vi.fn(),
  openPlayer: vi.fn(),
  downloads: [
    {
      id: "dl-1",
      metaId: "tt9999999",
      title: "Already Downloaded Film",
      subtitle: "2025",
      poster: null,
      season: null,
      episode: null,
      streamLabel: "1080p",
      url: "https://example.invalid/video.mkv",
      path: "/Users/test/Downloads/Already Downloaded Film.mkv",
      status: "done",
      receivedBytes: 1024 * 1024 * 500,
      totalBytes: 1024 * 1024 * 500,
      ratio: 1,
      bytesPerSec: 0,
      error: null,
      startedAt: 1_700_000_000_000,
    } satisfies DownloadItem,
  ],
  validatedDownloadSource: vi.fn(),
}));

vi.mock("@/lib/view", () => ({
  useView: () => ({
    view: mocks.view,
    setView: mocks.setView,
    openStats: mocks.openStats,
    openPlayer: mocks.openPlayer,
  }),
  useScrollMemory: () => {},
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string) => key,
  t: (key: string) => key,
  getUiLanguage: () => "fr",
}));
vi.mock("@/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform")>();
  return {
    ...actual,
    hasNativeDesktopUx: () => mocks.unified,
    isMobileTauri: () => false,
    isWeb: () => false,
  };
});
vi.mock("@/lib/platform-capabilities", () => ({
  currentPlatformCapabilities: () => ({
    browserPlayback: true,
    localFiles: true,
    mpvPlayback: true,
    nativeDownloads: true,
    nativeTorrent: true,
    social: true,
    systemCast: true,
    systemIntegration: true,
  }),
}));
vi.mock("@/lib/download/downloads-store", () => ({
  useDownloads: () => mocks.downloads,
  useActiveDownloadCount: () => 0,
  cancelDownload: vi.fn(),
  pauseDownload: vi.fn(),
  prioritizeDownload: vi.fn(),
  resumeDownload: vi.fn(),
  revealDownload: vi.fn(),
}));
vi.mock("@/lib/download/offline-playback", () => ({
  validatedDownloadSource: (...args: unknown[]) => mocks.validatedDownloadSource(...args),
}));
vi.mock("@/views/downloads/download-dir-bar", () => ({
  DownloadDirBar: () => <div data-testid="dir-bar" />,
}));
vi.mock("@/components/poster", () => ({
  Poster: () => <div />,
  usePosterChain: () => ({ src: undefined, onError: () => {} }),
}));
vi.mock("@/components/delete-download-dialog", () => ({
  DeleteDownloadDialog: () => null,
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { rpdbKey: "" }, update: vi.fn() }),
}));
vi.mock("@/lib/trakt/provider", () => ({ useTrakt: () => ({ isConnected: false }) }));
vi.mock("@/lib/anilist/provider", () => ({ useAnilist: () => ({ isConnected: false }) }));
vi.mock("@/lib/simkl/provider", () => ({ useSimkl: () => ({ isConnected: false }) }));
vi.mock("@/lib/mal/provider", () => ({ useMal: () => ({ isConnected: false }) }));
vi.mock("@/lib/stremboxd/provider", () => ({ useLetterboxd: () => ({ isActive: false }) }));
vi.mock("@/lib/discord/activity-hint", () => ({ pushActivityHint: () => () => {} }));
vi.mock("@/lib/watchlist", () => ({ watchlistHas: () => false }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.view = "downloads";
  mocks.unified = true;
  mocks.validatedDownloadSource.mockResolvedValue({
    meta: { id: "tt9999999", name: "Already Downloaded Film", type: "movie" },
    url: "/Users/test/Downloads/Already Downloaded Film.mkv",
    title: "Already Downloaded Film",
    notWebReady: true,
    resume: true,
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

describe("LibraryView + embedded DownloadsView", () => {
  it("opens directly on Downloads when routed from downloads view and plays completed files", async () => {
    await act(async () => {
      root.render(<LibraryView active />);
    });

    const downloadsTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
      b.textContent?.includes("Downloads"),
    );
    expect(downloadsTab?.getAttribute("aria-selected")).toBe("true");
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Already Downloaded Film");
    });

    const playBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Watch offline"]')!;
    await act(async () => {
      playBtn.click();
    });
    expect(mocks.validatedDownloadSource).toHaveBeenCalledWith(mocks.downloads[0]);
    expect(mocks.openPlayer).toHaveBeenCalledTimes(1);
  });

  it("ties the Downloads tab to the downloads view, so the sidebar sub-link agrees", async () => {
    mocks.view = "library";
    localStorage.setItem("harbor.library.tab", "downloads");
    await act(async () => {
      root.render(<LibraryView active />);
    });
    const tab = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes(name))!;

    // My library never opens on Downloads by itself, even if it was the last tab.
    expect(tab("History").getAttribute("aria-selected")).toBe("false");
    expect(tab("Watchlist").getAttribute("aria-selected")).toBe("true");

    await act(async () => tab("Downloads").click());
    expect(mocks.setView).toHaveBeenCalledWith("downloads");

    mocks.view = "downloads";
    mocks.setView.mockClear();
    await act(async () => root.render(<LibraryView active />));
    expect(tab("Downloads").getAttribute("aria-selected")).toBe("true");
    await act(async () => tab("History").click());
    expect(mocks.setView).toHaveBeenCalledWith("library");
    expect(localStorage.getItem("harbor.library.tab")).toBe("history");
  });

  it("keeps the Downloads tab local where Downloads has its own page", async () => {
    mocks.unified = false;
    mocks.view = "library";
    await act(async () => {
      root.render(<LibraryView active />);
    });
    const tab = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes(name))!;

    await act(async () => tab("Downloads").click());
    expect(mocks.setView).not.toHaveBeenCalled();
    expect(tab("Downloads").getAttribute("aria-selected")).toBe("true");
    expect(localStorage.getItem("harbor.library.tab")).toBe("downloads");
  });

  it("aligns the library container and embedded Downloads tab flush with the full-width Home/Explore shell", async () => {
    await act(async () => {
      root.render(<LibraryView active />);
    });
    const main = host.querySelector<HTMLElement>("main");
    expect(main?.className).toContain("px-5");
    expect(main?.className).toContain("sm:px-8");
    expect(main?.className).toContain("lg:px-12");

    const shell = host.querySelector<HTMLDivElement>("main > div[data-tauri-drag-region]");
    expect(shell?.className).toContain("w-full");
    expect(shell?.className).not.toContain("mx-auto");
    expect(shell?.className).not.toContain("max-w-6xl");

    await vi.waitFor(() => {
      const downloadsSection = host.querySelector<HTMLElement>('section[aria-label="Downloads"]');
      expect(downloadsSection).not.toBeNull();
      expect(downloadsSection?.className).toContain("w-full");
      expect(downloadsSection?.className).not.toContain("mx-auto");
      expect(downloadsSection?.className).not.toContain("max-w-4xl");
    });
  });
});
