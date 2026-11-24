// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { emptySnapshot, type PlayerBridge } from "@/lib/player/bridge";
import { readResumeMs, saveResumeMs } from "@/lib/resume";
import type { PlayerSrc } from "@/lib/view";
import { useBridgeLoad } from "./use-bridge-load";

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { resumePrompt: true, resumePlayback: true } }),
}));

it("seeks back only once when mpv synchronously emits from subscribe and seek", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const url = "https://example.invalid/clip.mp4";
  const src: PlayerSrc = { url, title: "Clip", meta: { id: `url:${url}`, name: "Clip", type: "movie" } };
  const root = createRoot(document.createElement("div"));
  const snapshot = { ...emptySnapshot, durationSec: 30, positionSec: 16 };
  let listener: Parameters<PlayerBridge["subscribe"]>[0] | undefined;
  const unsubscribe = vi.fn(() => { listener = undefined; });
  const seek = vi.fn(() => {
    // A bounded synchronous emit makes an accidental second seek observable.
    if (seek.mock.calls.length === 1) listener?.(snapshot);
  });
  const bridge = {
    load: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    subscribe: vi.fn((onSnapshot: NonNullable<typeof listener>) => {
      listener = onSnapshot;
      onSnapshot(snapshot);
      return unsubscribe;
    }),
    seek,
  } satisfies Pick<PlayerBridge, "load" | "play" | "subscribe" | "seek">;

  function Player() {
    useBridgeLoad({
      bridgeRef: { current: bridge as unknown as PlayerBridge },
      inRoomRef: { current: false },
      isHostRef: { current: false },
      bridgeReady: true,
      bridgeKey: "mpv",
      src,
      transcodedUrl: null,
      season: undefined,
      episode: undefined,
      authKey: null,
    });
    return null;
  }

  try {
    saveResumeMs(src.meta.id, 16_000);
    expect(readResumeMs(src.meta.id)).toBe(16_000);
    await act(async () => root.render(<Player />));
    expect(bridge.load).toHaveBeenCalledWith(expect.objectContaining({ startAtSec: 16 }));
    expect(seek).toHaveBeenCalledExactlyOnceWith(0);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(bridge.play).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }

  expect(unsubscribe).toHaveBeenCalledOnce();
});
