// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DownloadItem } from "@/lib/download/downloads-store";
import { DownloadsView } from "./downloads";

const mocks = vi.hoisted(() => ({ items: [] as DownloadItem[], remove: vi.fn() }));
vi.mock("@/lib/download/downloads-store", () => ({ useDownloads: () => mocks.items, removeDownload: mocks.remove, revealDownload: vi.fn(), pauseDownload: vi.fn(), resumeDownload: vi.fn(), cancelDownload: vi.fn(), prioritizeDownload: vi.fn() }));
vi.mock("@/components/poster", () => ({ Poster: () => null, usePosterChain: () => ({ src: undefined, onError: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: {} }) }));
vi.mock("@/lib/view", () => ({ useView: () => ({ setView: vi.fn(), openPlayer: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, t: (key: string) => key, getUiLanguage: () => "fr" }));
vi.mock("./downloads/download-dir-bar", () => ({ DownloadDirBar: () => null }));
let host: HTMLDivElement;
let root: Root;
const byText = (text: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === text)!;
const click = async (button: HTMLButtonElement) => act(async () => { button.focus(); button.click(); });
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) { return this.parentElement; });
  mocks.items = [{ id: "fixture", metaId: "fiction", title: "Fixture film", season: null, status: "done", receivedBytes: 42, path: "/fixtures/file.mkv" } as DownloadItem];
  mocks.remove.mockReset().mockResolvedValue(false);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DownloadsView />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("confirms before deleting from the full list and makes failed deletion visible in attention", async () => {
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Delete download and file"]')!);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe("Cancel");
  await click(byText("Cancel", document.querySelector('[role="dialog"]')!));
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.items = [{ ...mocks.items[0], status: "removal-error", error: "permission denied" }];
  await act(async () => root.render(<DownloadsView />));
  await click(byText("Needs attention"));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Check folder permissions");
  expect(host.querySelector('[aria-label="Resume download"]')).toBeNull();
  expect(host.querySelector('[aria-label="Watch offline"]')).toBeNull();
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Retry deletion"]')!);
  await click(byText("Delete download and file", document.querySelector('[role="dialog"]')!));
  expect(mocks.remove).toHaveBeenCalledWith("fixture");
});

it("keeps confirmation mounted when a ready-filtered row disappears during removal", async () => {
  await click(byText("Ready to watch"));
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Delete download and file"]')!);
  mocks.items = [{ ...mocks.items[0], status: "removing" }];
  await act(async () => root.render(<DownloadsView />));
  expect(host.querySelector('[aria-label="Delete download and file"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click(byText("Cancel", document.querySelector('[role="dialog"]')!));
  expect(document.activeElement).toBe(host.querySelector("h1"));
});
