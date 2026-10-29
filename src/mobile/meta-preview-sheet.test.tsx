// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { MetaPreviewSheet } from "./meta-preview-sheet";
import { closeMetaPreview, previewMeta } from "./meta-preview";

const view = { openMeta: vi.fn(), openPicker: vi.fn() };
vi.mock("@/lib/view", () => ({ useView: () => view }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
const watchlist = vi.hoisted(() => ({ toggleWatchlist: vi.fn(), useInWatchlist: vi.fn(() => false) }));
vi.mock("@/lib/watchlist", () => watchlist);

afterEach(() => {
  act(() => closeMetaPreview());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const film: Meta = { id: "tt1", type: "movie", name: "Heat", releaseInfo: "1995", genres: ["Crime", "Thriller"], description: "A heist." };

function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MetaPreviewSheet />));
  return { host, root };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`no ${label} button`);
  return found;
}

it("previews a title in a sheet instead of opening its page", () => {
  const { host, root } = mount();
  expect(host.textContent).toBe("");
  act(() => previewMeta(film));
  expect(host.textContent).toContain("Heat");
  expect(host.textContent).toContain("Thriller");
  expect(host.textContent).toContain("A heist.");
  expect(view.openMeta).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("opens the page from the sheet and closes it", () => {
  const { host, root } = mount();
  act(() => previewMeta(film));
  act(() => button(host, "Details & more").click());
  expect(view.openMeta).toHaveBeenCalledWith(film);
  expect(host.textContent).toBe("");
  act(() => root.unmount());
});

it("plays a film through the picker, as a card's play button does", () => {
  const { host, root } = mount();
  act(() => previewMeta(film));
  act(() => button(host, "Play").click());
  expect(view.openPicker).toHaveBeenCalledWith(film, undefined, { autoPlay: true, resume: true });
  act(() => root.unmount());
});

it("offers no direct play for a series, whose episode is picked on its page", () => {
  const { host, root } = mount();
  act(() => previewMeta({ ...film, id: "tt2", type: "series", name: "Hijack" }));
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Play")).toBe(false);
  act(() => root.unmount());
});

it("adds the title to the watchlist without leaving the sheet", () => {
  const { host, root } = mount();
  act(() => previewMeta(film));
  act(() => button(host, "To watch").click());
  expect(watchlist.toggleWatchlist).toHaveBeenCalledWith({ id: "tt1", type: "movie", name: "Heat", poster: undefined });
  expect(host.textContent).toContain("Heat");
  act(() => root.unmount());
});
