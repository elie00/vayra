// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { TorrentLinksRow } from "./torrent-links-row";

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

it("hands magnet links and .torrent files to VAYRA when another app opens them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let own = false;
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "torrent_links_default") return own;
    if (cmd === "torrent_links_make_default") own = true;
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<TorrentLinksRow />));
  expect(host.textContent).toContain("Another app opens them.");

  const useVayra = [...host.querySelectorAll("button")].find((b) => b.textContent === "Use VAYRA")!;
  await act(async () => useVayra.click());

  expect(invoke).toHaveBeenCalledWith("torrent_links_make_default");
  expect(host.textContent).toContain("VAYRA opens them.");
  act(() => root.unmount());
});
