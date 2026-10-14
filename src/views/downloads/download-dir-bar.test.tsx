// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadDirBar } from "./download-dir-bar";

const mocks = vi.hoisted(() => ({ dir: vi.fn(), open: vi.fn(), reveal: vi.fn(), invoke: vi.fn(), update: vi.fn(), custom: "" }));
vi.mock("@tauri-apps/api/path", () => ({ downloadDir: mocks.dir }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: mocks.reveal }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { downloadDir: mocks.custom }, update: mocks.update }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, getUiLanguage: () => "fr" }));
vi.mock("@/lib/platform", () => ({ hasNativeDesktopUx: () => true }));
vi.mock("@/views/settings/shared", () => ({ ToggleRow: () => null }));
vi.mock("./policy-controls", () => ({ DownloadPolicyControls: () => null }));
let host: HTMLDivElement;
let root: Root;
const change = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Change")!;
const render = () => act(async () => root.render(<DownloadDirBar />));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.custom = "";
  mocks.dir.mockReset().mockResolvedValue("/fixtures/default");
  mocks.open.mockReset().mockResolvedValue(null);
  mocks.reveal.mockReset().mockResolvedValue(undefined);
  mocks.invoke.mockReset().mockResolvedValue(1024 ** 3);
  mocks.update.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("turns failed default detection into an actionable state and permits choosing a folder", async () => {
  mocks.dir.mockRejectedValue(new Error("fixture failure"));
  mocks.open.mockResolvedValue("/fixtures/chosen");
  await render();
  expect(host.textContent).not.toContain("Detecting...");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Download folder is unavailable. Choose a folder.");
  expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  await act(async () => change().click());
  expect(mocks.update).toHaveBeenCalledWith({ downloadDir: "/fixtures/chosen" });
});

it("reports chooser failure, allows retry, and treats cancellation as no change", async () => {
  await render();
  mocks.open.mockRejectedValueOnce(new Error("private details"));
  await act(async () => change().click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("The folder chooser could not be opened. Try again.");
  expect(host.textContent).not.toContain("private details");
  expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => change().click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("opens only one chooser while its result is pending", async () => {
  let finish!: (path: string | null) => void;
  mocks.open.mockReturnValueOnce(new Promise<string | null>((resolve) => { finish = resolve; }));
  await render();
  const trigger = change();
  await act(async () => { trigger.click(); trigger.click(); });
  expect(mocks.open).toHaveBeenCalledTimes(1);
  expect(trigger.disabled).toBe(true);
  expect(trigger.getAttribute("aria-busy")).toBe("true");
  await act(async () => finish(null));
  expect(trigger.disabled).toBe(false);
});

it("shows folder opening failure without changing the selected destination", async () => {
  await render();
  mocks.reveal.mockRejectedValueOnce(new Error("private details"));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("The folder could not be opened.");
  expect(mocks.update).not.toHaveBeenCalled();
});

it("distinguishes a pending disk-space query from failure and ignores an old folder result", async () => {
  let finish!: (n: number) => void;
  mocks.invoke.mockReturnValueOnce(new Promise<number>((resolve) => { finish = resolve; }));
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading…");
  mocks.custom = "/fixtures/new";
  mocks.invoke.mockRejectedValueOnce(new Error("unavailable"));
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Available space could not be determined");
  await act(async () => finish(1024 ** 3));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Available space could not be determined");
});
