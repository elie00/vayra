// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DownloadItem } from "@/lib/download/downloads-store";
import { DownloadsButton } from "./downloads-popover";

const mocks = vi.hoisted(() => ({ items: [] as DownloadItem[], remove: vi.fn(), reveal: vi.fn() }));
vi.mock("@/lib/download/downloads-store", () => ({
  useDownloads: () => mocks.items, removeDownload: mocks.remove, revealDownload: mocks.reveal,
  pauseDownload: vi.fn(), resumeDownload: vi.fn(), cancelDownload: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/view", () => ({ useView: () => ({ openMeta: vi.fn(), setView: vi.fn() }) }));
let host: HTMLDivElement;
let root: Root;
const button = (label: string, scope: ParentNode = document) => scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const key = async (value: string, shiftKey = false) => act(async () => {
  (document.activeElement ?? document).dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }));
});
const click = async (element: HTMLElement) => act(async () => { element.focus(); element.click(); });

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) { return this.parentElement; });
  mocks.items = [{ id: "fictional", title: "Fictional film", subtitle: null, status: "done", path: "/fixtures/video.mkv", metaId: "fixture", ratio: 1, receivedBytes: 42, totalBytes: 42 } as DownloadItem];
  mocks.remove.mockReset().mockResolvedValue(true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DownloadsButton />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("returns focus to its expanded trigger on Escape but not on outside click", async () => {
  const trigger = button("Downloads");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await click(trigger);
  expect(document.getElementById(trigger.getAttribute("aria-controls")!)).not.toBeNull();
  button("Show in folder").focus();
  await key("Escape");
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await click(trigger);
  const outside = document.createElement("button"); document.body.append(outside);
  outside.focus();
  await act(async () => outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(document.activeElement).toBe(outside);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  outside.remove();
});

it("requires explicit deletion and traps focus, with safe initial cancellation and Escape", async () => {
  await click(button("Downloads"));
  const remove = button("Delete download and file");
  await click(remove);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  expect(dialog.textContent).toContain("Fictional film");
  expect(dialog.textContent).toContain("/fixtures/video.mkv");
  expect(dialog.textContent).toContain("permanently deleted");
  expect(mocks.remove).not.toHaveBeenCalled();
  const cancel = document.activeElement as HTMLButtonElement;
  expect(cancel.textContent).toBe("Cancel");
  await key("Tab", true);
  expect(document.activeElement?.textContent).toBe("Delete download and file");
  await key("Tab");
  expect(document.activeElement).toBe(cancel);
  await key("Escape");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(remove);
  expect(button("Downloads").getAttribute("aria-expanded")).toBe("true");
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("keeps a failed deletion actionable in the dialog and does not dismiss while busy", async () => {
  let finish!: (removed: boolean) => void;
  mocks.remove.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
  await click(button("Downloads")); await click(button("Delete download and file"));
  const confirm = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).at(-1)!;
  await click(confirm());
  expect(mocks.remove).toHaveBeenCalledWith("fictional");
  await key("Escape");
  expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-busy")).toBe("true");
  await act(async () => finish(false));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Check folder permissions");
  expect(confirm().disabled).toBe(false);
  await click(confirm());
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
