// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/profiles", () => ({ useActiveKid: () => null }));
vi.mock("@/chrome/topbar", () => ({ Topbar: () => null }));
vi.mock("@/components/harbor-loader", () => ({ HarborLoader: () => null }));
vi.mock("./loader-logo-or-text", () => ({ LoaderLogoOrText: () => null }));
vi.mock("./stream-loading-bar", () => ({ StreamLoadingBar: () => null }));

import { CinematicPlayerLoader } from "./cinematic-player-loader";

afterEach(() => vi.unstubAllGlobals());

const snap = { status: "loading", errorCode: null, buffering: false } as unknown as PlayerSnapshot;
const torrent = {
  url: "http://127.0.0.1:52527/stream/3adac0d5dffe82db8637d7eaa7c3c25e8b10aeed/1",
  meta: { id: "tt1234567", name: "Show" },
  title: "Show",
} as unknown as PlayerSrc;

function render(src: PlayerSrc, onCancel: () => void, onNextSource?: () => void) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<CinematicPlayerLoader src={src} snap={snap} onCancel={onCancel} onNextSource={onNextSource} />));
  const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) ?? null;
  return { button, unmount: () => act(() => root.unmount()) };
}

it("offers the next source while a stream loads, and the source list", () => {
  // The screen advised another source but only offered "Cancel".
  const onCancel = vi.fn();
  const onNextSource = vi.fn();
  const { button, unmount } = render(torrent, onCancel, onNextSource);
  act(() => button("Next source")!.click());
  expect(onNextSource).toHaveBeenCalledOnce();
  act(() => button("Choose another source")!.click());
  expect(onCancel).toHaveBeenCalledOnce();
  unmount();
});

it("has no next source for a file on this computer", () => {
  const local = { ...torrent, url: "/Users/me/Downloads/Show - S01E01.mkv" } as PlayerSrc;
  const { button, unmount } = render(local, vi.fn(), vi.fn());
  expect(button("Next source")).toBeNull();
  expect(button("Cancel")).not.toBeNull();
  unmount();
});

it("points to the next source once a torrent has loaded for 20 seconds", () => {
  // The player's own "stalled" notice came only after 50 s.
  vi.useFakeTimers();
  try {
    const { button, unmount } = render(torrent, vi.fn(), vi.fn());
    expect(button("Next source")!.dataset.emphasis).toBeUndefined();
    act(() => vi.advanceTimersByTime(19_000));
    expect(button("Next source")!.dataset.emphasis).toBeUndefined();
    act(() => vi.advanceTimersByTime(1_500));
    expect(button("Next source")!.dataset.emphasis).toBe("on");
    expect(button("Next source")!.closest("div")!.parentElement!.textContent).toContain("This source is taking a while.");
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
