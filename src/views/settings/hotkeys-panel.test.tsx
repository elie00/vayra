// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HotkeysPanel } from "./hotkeys-panel";

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: { hotkeys: { playerFullscreen: "g" }, seekBackStepSec: 10, seekForwardStepSec: 10, escExitsFullscreenFirst: true, confirmPlayerExit: true },
    update: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), key),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HotkeysPanel />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const names = () => [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "");

it("names each binding after the action it triggers", () => {
  const ctrlZero = names().filter((n) => /\(Ctrl \+ 0\)$/.test(n));
  expect(ctrlZero).toHaveLength(2);
  expect(new Set(ctrlZero).size).toBe(2);
  expect(names()).toContain("Toggle fullscreen (G)");
});

it("tells the reset button of a custom binding which action it resets", () => {
  expect(names()).toContain("Reset to default (Toggle fullscreen)");
});

it("tells the back and forward seek steps apart", () => {
  const steps = names().filter((n) => /(^| )5s$/.test(n));
  expect(steps).toHaveLength(2);
  expect(new Set(steps).size).toBe(2);
});
