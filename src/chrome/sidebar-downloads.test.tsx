// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

const mocks = vi.hoisted(() => ({
  view: "home" as "home" | "library" | "downloads",
  collapsed: true,
  activeDownloads: 0,
  setView: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/view", () => ({
  useView: () => ({ view: mocks.view, setView: mocks.setView, chromeHidden: false }),
}));
vi.mock("@/lib/parental", () => ({
  useParental: () => ({ locked: false, unlock: vi.fn(), hiddenTabs: {} }),
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: {
      sidebarCollapsed: mocks.collapsed,
      theme: { preset: "studio" },
      showPlaylistsTab: false,
      hideContent: {},
      macPinnedViews: [],
      hotkeys: {},
    },
    update: vi.fn(),
  }),
}));
vi.mock("@/lib/download/downloads-store", () => ({
  useActiveDownloadCount: () => mocks.activeDownloads,
}));
vi.mock("@/lib/search-context", () => ({
  useSearch: () => ({ setOpen: vi.fn() }),
}));
vi.mock("@/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform")>();
  return {
    ...actual,
    desktopUx: () => "mac",
    hasNativeDesktopUx: () => true,
    isMobileTauri: () => false,
    isWeb: () => false,
  };
});
vi.mock("@/lib/nav-drawer", () => ({
  setNavDrawer: vi.fn(),
  useNavDrawer: () => false,
}));
vi.mock("@/chrome/sidebar/profile-chip", () => ({
  ProfileChip: () => <div data-testid="profile-chip" />,
}));
vi.mock("@/chrome/sidebar/collapse-toggle", () => ({
  CollapseToggle: () => <button type="button" aria-label="Toggle sidebar" />,
}));
vi.mock("@/components/parental-pin-modal", () => ({
  ParentalPinModal: () => null,
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.view = "home";
  mocks.collapsed = true;
  mocks.activeDownloads = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Sidebar desktop downloads consolidation", () => {
  it("omits a separate Downloads nav item on native desktop (collapsed and expanded)", async () => {
    for (const collapsed of [true, false]) {
      mocks.collapsed = collapsed;
      await act(async () => root.render(<Sidebar />));
      expect(host.querySelector('[data-vayra-nav="downloads"]')).toBeNull();
      expect(host.querySelector('[data-vayra-nav="library"]')).not.toBeNull();
    }
  });

  it("keeps My library highlighted when viewing downloads", async () => {
    mocks.view = "downloads";
    mocks.collapsed = false;
    await act(async () => root.render(<Sidebar />));

    expect(host.querySelector('[data-vayra-nav="downloads"]')).toBeNull();
    const lib = host.querySelector<HTMLButtonElement>('[data-vayra-nav="library"]')!;
    expect(lib.getAttribute("aria-current")).toBe("page");
  });
});
