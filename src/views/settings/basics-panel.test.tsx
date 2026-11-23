// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BasicsPanel } from "./basics-panel";
import { SettingsActiveContext } from "./shared";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  settings: {
    rdKey: "",
    tbKey: "",
    adKey: "",
    pmKey: "",
    dlKey: "",
    preferredLanguages: ["fr"],
    instantPlay: true,
    seasonSourceLock: false,
    theme: { preset: "cool-grey" as const },
  },
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: mocks.settings, update: mocks.update }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/vayra-account", () => ({ useVayraAccount: () => ({ user: null }) }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.settings.instantPlay = true;
  mocks.settings.seasonSourceLock = false;
  mocks.settings.theme = { preset: "cool-grey" };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("BasicsPanel", () => {
  it("switches playback mode and theme preset directly without jargon", () => {
    const setActive = vi.fn();
    act(() =>
      root.render(
        <SettingsActiveContext.Provider value={{ setActive }}>
          <BasicsPanel />
        </SettingsActiveContext.Provider>,
      ),
    );

    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
    const chooseFirst = buttons.find((b) => b.textContent?.includes("Choose first"))!;
    act(() => chooseFirst.click());
    expect(mocks.update).toHaveBeenCalledWith({ instantPlay: false, seasonSourceLock: false });

    const obsidian = buttons.find((b) => b.textContent?.includes("Obsidian"))!;
    act(() => obsidian.click());
    expect(mocks.update).toHaveBeenCalledWith({ theme: { preset: "obsidian" } });

    const morePlayback = buttons.find((b) => b.textContent?.includes("More playback options"))!;
    act(() => morePlayback.click());
    expect(setActive).toHaveBeenCalledWith("player");

    const customize = buttons.find((b) => b.textContent?.includes("Customize further"))!;
    act(() => customize.click());
    expect(setActive).toHaveBeenCalledWith("theme");
  });
});
