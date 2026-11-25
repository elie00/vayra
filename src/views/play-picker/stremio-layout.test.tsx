// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import { StremioLayout } from "./stremio-layout";

const mockSetView = vi.fn();
let mockFullStreamDescription = false;

vi.mock("@/lib/i18n", () => ({
  t: (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));

vi.mock("@/lib/view", () => ({
  useView: () => ({ setView: mockSetView, goBack: vi.fn(), openSettings: vi.fn() }),
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: {
      customStreamFilters: [],
      showQualityBadge: true,
      showDubBadge: true,
      fullStreamDescription: mockFullStreamDescription,
      preferredLanguages: ["French", "English"],
    },
    update: vi.fn(),
  }),
}));

function makeStream(overrides: Partial<ScoredStream> = {}): ScoredStream {
  return {
    addonId: "com.stremio.torrentio.addon",
    addonName: "Torrentio",
    infoHash: "abcdef1234567890abcdef1234567890abcdef12",
    parsedTitle: "Nocturne",
    episodeTitle: null,
    resolution: "1080p",
    hdrFormat: null,
    codec: "HEVC",
    source: "WEB-DL",
    audio: { codec: "DD+", channels: 6 },
    audioLanguages: ["French", "English"],
    size: Math.round(4.5 * 1024 ** 3),
    seeders: 81,
    cached: {},
    inLibrary: {},
    container: "mkv",
    releaseGroup: "FLUX",
    releaseGroupNormalized: "FLUX",
    remux: false,
    edition: null,
    year: 2020,
    yearRange: null,
    season: null,
    episode: null,
    seasonPack: false,
    discIndex: null,
    repackIteration: 0,
    proper: false,
    hardcoded: false,
    animeHash: null,
    scamScore: 0,
    score: 120,
    reasons: [{ signal: "language-match", delta: 30 }],
    tier: "1080p",
    ...overrides,
  };
}

let mountedRoot: Root | null = null;
let mountedHost: HTMLDivElement | null = null;

function renderLayout(
  streams: ScoredStream[],
  props: Partial<React.ComponentProps<typeof StremioLayout>> = {},
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onPlay = vi.fn();
  act(() => {
    root.render(
      <StremioLayout
        streams={streams}
        addons={[]}
        pipelineDone
        loadingAddonCount={0}
        failedStreams={new Map()}
        preserveOrder
        onPlay={onPlay}
        {...props}
      />,
    );
  });
  mountedRoot = root;
  mountedHost = host;
  return { host, onPlay };
}

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot?.unmount());
    mountedRoot = null;
  }
  if (mountedHost) {
    mountedHost.remove();
    mountedHost = null;
  }
  mockFullStreamDescription = false;
  mockSetView.mockReset();
  vi.unstubAllGlobals();
});

describe("StremioLayout redesigned picker", () => {
  it("renders Best choice card, quality-grouped compact rows, addon error banner, and external links strip", () => {
    const best4k = makeStream({
      infoHash: "1111111111111111111111111111111111111111",
      resolution: "4K",
      hdrFormat: "DV",
      audio: { codec: "Atmos", channels: 8 },
      title:
        "Nocturne.2020.2160p.WEB-DL.DV.Atmos.x265-FLUX.mkv\n👤 142 💾 12.40 GB ⚙️ 1337x\n🇫🇷/🇬🇧/🇪🇸/🇩🇪/🇮🇹/🇵🇹/🇯🇵/🇰🇷",
      size: Math.round(12.4 * 1024 ** 3),
      seeders: 142,
      score: 200,
    });
    const second1080 = makeStream({
      infoHash: "2222222222222222222222222222222222222222",
      resolution: "1080p",
      title: "Nocturne.2020.1080p.WEB-DL.DDP5.1.H265.mkv\n👤 34 💾 4.20 GB ⚙️ YTS\n🇫🇷/🇬🇧",
      size: Math.round(4.2 * 1024 ** 3),
      seeders: 34,
      score: 140,
    });
    const third720 = makeStream({
      infoHash: "3333333333333333333333333333333333333333",
      resolution: "720p",
      title: "Nocturne.2020.720p.WEBRip.mkv\n👤 6 💾 1.50 GB ⚙️ RARBG",
      size: Math.round(1.5 * 1024 ** 3),
      seeders: 6,
      score: 90,
    });
    const orionErr = makeStream({
      addonId: "com.orionoid.stremio",
      addonName: "Orion",
      infoHash: undefined,
      url: undefined,
      size: null,
      seeders: null,
      name: "Orion",
      title: "⚠️ ERROR! Invalid user API key",
    });
    const peario = makeStream({
      addonId: "com.peario.addon",
      addonName: "Peario",
      infoHash: undefined,
      url: undefined,
      externalUrl: "https://peario.xyz/watch/123",
      size: null,
      seeders: null,
      name: "Peario",
      title: "Watch together on Peario",
    });

    const { host, onPlay } = renderLayout([best4k, second1080, third720, orionErr, peario]);
    const text = host.textContent ?? "";

    // 1. Best choice card at top
    const bestSection = host.querySelector('section[aria-label="Best choice"]');
    expect(bestSection).not.toBeNull();
    expect(bestSection?.textContent).toContain("4K");
    expect(bestSection?.textContent).toContain("DV");
    expect(bestSection?.textContent).toContain("Atmos");
    expect(bestSection?.textContent).toContain("142");

    // 2. Quality-grouped compact rows below (1080p + 720p)
    const section1080 = host.querySelector('section[aria-label="1080p"]');
    const section720 = host.querySelector('section[aria-label="720p"]');
    expect(section1080).not.toBeNull();
    expect(section720).not.toBeNull();

    // Clicking the compact 1080p row triggers onPlay with that stream
    const rowButton = section1080?.querySelector("button");
    expect(rowButton).not.toBeNull();
    act(() => {
      rowButton?.click();
    });
    expect(onPlay).toHaveBeenCalledWith(second1080);

    // 3. Languages rendered as ISO codes without raw flag emojis
    expect(bestSection?.textContent).toContain("FR · EN");
    expect(text).not.toContain("🇫🇷");
    expect(text).not.toContain("🇬🇧");

    // 4. Addon error banner separated (no Play button, has Manage addons action)
    const errorBanner = host.querySelector('[role="status"]');
    expect(errorBanner?.textContent).toContain("Orion");
    expect(errorBanner?.textContent).toContain("Invalid user API key");
    expect(errorBanner?.textContent).not.toContain("Play");
    const manageBtn = errorBanner?.querySelector("button");
    act(() => {
      manageBtn?.click();
    });
    expect(mockSetView).toHaveBeenCalledWith("addons");

    // 5. External links strip at bottom
    const externalSection = host.querySelector('section[aria-label="Open elsewhere"]');
    expect(externalSection?.textContent).toContain("Peario");
    const pearioBtn = externalSection?.querySelector("button");
    act(() => {
      pearioBtn?.click();
    });
    expect(onPlay).toHaveBeenCalledWith(peario);
  });

  it("shows opt-in raw description when fullStreamDescription is enabled and toggles score details", () => {
    mockFullStreamDescription = true;
    const s1 = makeStream({
      title: "RAW_MULTI_LINE_TITLE\nSecond raw line",
      reasons: [{ signal: "language-match", delta: 25 }],
    });
    const { host } = renderLayout([s1]);

    expect(host.textContent).toContain("RAW_MULTI_LINE_TITLE");
    expect(host.textContent).toContain("Second raw line");

    const infoBtn = host.querySelector('button[aria-label="Why this score?"]');
    expect(infoBtn?.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      (infoBtn as HTMLButtonElement | null)?.click();
    });
    expect(infoBtn?.getAttribute("aria-expanded")).toBe("true");
  });
});
