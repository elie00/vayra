// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getPlusOpen, MobileShell, setPlusOpen } from "./shell";

const search = vi.hoisted(() => ({ open: true, setOpen: vi.fn() }));
vi.mock("@/lib/search-context", () => ({ useSearch: () => search }));
vi.mock("@/lib/view", () => ({ useView: () => ({ topKind: "home", setView: vi.fn(), player: null }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/mobile/mac-now-playing", () => ({ MacNowPlayingBar: () => null, MacRemoteSheet: () => null }));
vi.mock("@/mobile/together-sheet", () => ({ MobileTogetherSheet: () => null }));
vi.mock("@/chrome/sidebar/profile-chip", () => ({ ProfileChip: () => null }));
vi.mock("@/mobile/haptics", () => ({ haptic: vi.fn() }));

afterEach(() => {
  act(() => setPlusOpen(false));
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("closes the search page when the Menu tab opens the menu, so the menu is not hidden under it", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MobileShell />));
  const menuTab = [...host.querySelectorAll("button")].find((b) => b.textContent === "Menu");
  act(() => menuTab!.click());
  expect(getPlusOpen()).toBe(true);
  expect(search.setOpen).toHaveBeenCalledWith(false);
  act(() => root.unmount());
});
