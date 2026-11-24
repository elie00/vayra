// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SvpSection } from "./svp-section";

const state = vi.hoisted(() => ({ apply: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/svp", () => ({
  svpApply: state.apply,
  svpLaunch: vi.fn(),
  svpStatus: () => Promise.resolve({ installed: false, ready: false }),
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { playerSvp: false, svpTarget: "anime" }, update: state.update }),
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string>) =>
    Object.entries(vars ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), key),
}));
vi.mock("@/lib/window", () => ({ openUrl: vi.fn() }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.apply.mockReset().mockRejectedValue("SVP engine not found");
  state.update.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("announces why SVP could not be turned on", async () => {
  await act(async () => root.render(<SvpSection />));
  const toggle = [...host.querySelectorAll('[role="switch"]')].find((el) => el.textContent?.includes("Enable SVP"));
  await act(async () => (toggle as HTMLElement).click());
  expect(state.update).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't set up SVP: SVP engine not found");
});
