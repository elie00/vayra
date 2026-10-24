// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { NO_LINK, setLinkStatus } from "@/lib/connect/link";
import { PlayOnMacButton } from "./play-on-mac-button";

const invoke = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  act(() => setLinkStatus(NO_LINK));
  invoke.mockClear();
  vi.unstubAllGlobals();
});

const mac = { name: "MacBook", address: "192.168.1.85:11472" };
const series = { id: "tt0903747", type: "series", name: "Breaking Bad", poster: "https://img/bb.jpg" } as Meta;

function render(meta: Meta, episode?: { season: number; episode: number }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<PlayOnMacButton meta={meta} episode={episode} />));
  return { container, unmount: () => act(() => root.unmount()) };
}

it("shows only while a Mac is connected", () => {
  const { container, unmount } = render(series, { season: 2, episode: 3 });
  expect(container.textContent).toBe("");
  act(() => setLinkStatus({ mac, connected: false, state: null }));
  expect(container.textContent).toBe("");
  act(() => setLinkStatus({ mac, connected: true, state: null }));
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Play on MacBook");
  unmount();
});

it("starts the episode on the Mac", async () => {
  act(() => setLinkStatus({ mac, connected: true, state: null }));
  const { container, unmount } = render(series, { season: 2, episode: 3 });
  await act(async () => container.querySelector("button")!.click());
  expect(invoke).toHaveBeenCalledWith("connect_link_send", {
    message: {
      type: "load",
      meta: { id: "tt0903747", type: "series", name: "Breaking Bad", poster: "https://img/bb.jpg" },
      episode: { season: 2, episode: 3 },
    },
  });
  unmount();
});

it("leaves out an episode the Mac would refuse", async () => {
  act(() => setLinkStatus({ mac, connected: true, state: null }));
  const { container, unmount } = render(series, { season: -1, episode: 2.5 });
  await act(async () => container.querySelector("button")!.click());
  expect(invoke.mock.calls[0]).toEqual([
    "connect_link_send",
    { message: expect.objectContaining({ type: "load", episode: undefined }) },
  ]);
  unmount();
});
