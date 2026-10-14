// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFirstRunLocaleDetect } from "./region/locale-cascade";
import { SettingsProvider } from "./settings";

const file = vi.hoisted(() => ({ release: (_raw: string | null) => {}, reload: vi.fn() }));
vi.mock("./app-reload", () => ({ reloadApp: file.reload }));
vi.mock("./settings/file-store", () => ({
  readSettingsFile: () => new Promise<string | null>((resolve) => { file.release = resolve; }),
  persistSettings: async () => {},
}));

const reloads = () => file.reload.mock.calls.length;

function FirstRunLocale() {
  useFirstRunLocaleDetect();
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  file.reload.mockReset();
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("waits for storage before reloading on a language change, so a first-run locale cannot loop", async () => {
  await act(async () => root.render(<SettingsProvider><FirstRunLocale /></SettingsProvider>));
  expect(reloads()).toBe(0);

  await act(async () => file.release(null));
  expect(reloads()).toBe(1);
  const saved = JSON.parse(localStorage.getItem("harbor.settings") ?? "{}") as { tmdbLanguage?: string; localeDetected?: boolean };
  expect(saved).toMatchObject({ tmdbLanguage: "fr-FR", localeDetected: true });
});
