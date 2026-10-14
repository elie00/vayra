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

it("keeps focus on pause/resume across state changes", async () => {
  mocks.items = [{ ...mocks.items[0], status: "downloading" }];
  await act(async () => root.render(<DownloadsView />));
  host.querySelector<HTMLButtonElement>('[aria-label="Pause download"]')!.focus();
  mocks.items = [{ ...mocks.items[0], status: "paused" }];
  await act(async () => root.render(<DownloadsView />));
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Resume download"]'));
  mocks.items = [{ ...mocks.items[0], status: "downloading" }];
  await act(async () => root.render(<DownloadsView />));
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Pause download"]'));
});

it("restores focus to the active filter when its focused row leaves that category", async () => {
  mocks.items = [{ ...mocks.items[0], status: "downloading" }];
  await act(async () => root.render(<DownloadsView />));
  await click(byText("Downloading"));
  host.querySelector<HTMLButtonElement>('[aria-label="Pause download"]')!.focus();
  mocks.items = [{ ...mocks.items[0], status: "paused" }];
  await act(async () => root.render(<DownloadsView />));
  expect(document.activeElement).toBe(byText("Downloading"));
});

it("does not steal focus from another control when a download changes category", async () => {
  mocks.items = [{ ...mocks.items[0], status: "downloading" }];
  await act(async () => root.render(<DownloadsView />));
  await click(byText("Downloading"));
  host.querySelector<HTMLButtonElement>('[aria-label="Pause download"]')!.focus();
  const outside = document.createElement("button"); document.body.append(outside);
  try {
    outside.focus();
    mocks.items = [{ ...mocks.items[0], status: "paused" }];
    await act(async () => root.render(<DownloadsView />));
    expect(document.activeElement).toBe(outside);
  } finally { outside.remove(); }
});

it("deletes several episodes of a show together after one confirmation", async () => {
  const episode = (n: number) => ({ id: `ep${n}`, metaId: "show", title: "Fixture show", subtitle: `S01E0${n}`, season: 1, episode: n, status: "done", receivedBytes: 42, path: `/fixtures/e${n}.mkv`, startedAt: n } as DownloadItem);
  mocks.items = [episode(1), episode(2), episode(3)];
  mocks.remove.mockResolvedValue(true);
  await act(async () => root.render(<DownloadsView />));
  await click(byText("Select"));
  const box = (n: number) => host.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="S01E0${n}"]`)!;
  await act(async () => { box(1).click(); box(3).click(); });
  await click(byText("Delete selected ({n})"));
  expect(mocks.remove).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("S01E01");
  expect(dialog.textContent).toContain("S01E03");
  expect(dialog.textContent).not.toContain("S01E02");
  await click(byText("Delete {n} downloads and files", dialog));
  expect(mocks.remove.mock.calls.map(([id]) => id).sort()).toEqual(["ep1", "ep3"]);
});

it("selects every episode of a show at once", async () => {
  mocks.items = [1, 2].map((n) => ({ id: `ep${n}`, metaId: "show", title: "Fixture show", subtitle: `S01E0${n}`, season: 1, episode: n, status: "done", receivedBytes: 42, path: `/fixtures/e${n}.mkv`, startedAt: n } as DownloadItem));
  await act(async () => root.render(<DownloadsView />));
  await click(byText("Select"));
  await click(byText("Select all"));
  expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).every((b) => b.checked)).toBe(true);
  await click(byText("Cancel"));
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
});
