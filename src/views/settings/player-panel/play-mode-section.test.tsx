// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import fr from "@/lib/i18n/locales/fr";
import { DEFAULT } from "@/lib/settings/defaults";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => fr[key] ?? key }));
vi.mock("@/lib/platform", () => ({ isMobileTauri: () => false, isWeb: () => false }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: { ...DEFAULT, instantPlay: false, seasonSourceLock: false, rememberLastStream: true, resumePrompt: false },
    update: vi.fn(),
  }),
}));

import { PlayModePanel } from "./play-mode-section";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<PlayModePanel />));
  return { host, root };
}

const heading = (el: Element) => el.querySelector(".font-semibold")?.textContent ?? "";

it("says which way of playing is chosen, one at a time", () => {
  const { host, root } = mount();
  // The volume pop-up position buttons carry aria-pressed too; keep the cards.
  const choices = [...host.querySelectorAll("button[aria-pressed]")].filter((b) => heading(b) !== "");
  expect(choices.map(heading)).toEqual([fr["Instant"], fr["Manual picker"], fr["Lock to season server"]]);
  expect(choices.filter((b) => b.getAttribute("aria-pressed") === "true").map(heading)).toEqual([fr["Manual picker"]]);
  act(() => root.unmount());
});

it("exposes each toggle as a switch with its state", () => {
  const { host, root } = mount();
  const switches = new Map([...host.querySelectorAll("[role='switch']")].map((b) => [heading(b), b.getAttribute("aria-checked")]));
  expect(switches.get(fr["Remember last stream"])).toBe("true");
  expect(switches.get(fr["Ask to resume or start over"])).toBe("false");
  act(() => root.unmount());
});
