// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";

vi.mock("@/lib/player/playback-clock", () => ({
  getPlaybackBuffered: () => 0,
  getPlaybackPosition: () => 0,
  usePlaybackFlag: () => false,
}));
vi.mock("@/lib/picker-cache", () => ({ clearOnePickerCache: vi.fn() }));
vi.mock("@/lib/streams/resolve", () => ({ resolveViaDebrids: vi.fn() }));
vi.mock("@/lib/stream-proxy", () => ({ hasNativeStreamProxy: () => false, registerStreamProxy: vi.fn() }));
vi.mock("@/lib/stremio-server", () => ({ buildTranscodedUrl: vi.fn(), probeStremioServer: vi.fn() }));

import { useAutoRetry } from "./use-auto-retry";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Probe({ src }: { src: PlayerSrc }) {
  useAutoRetry({
    bridgeRef: { current: null },
    src,
    snap: { status: "playing", errorCode: null, durationSec: 0, videoWidth: 1920, videoHeight: 1080 } as unknown as PlayerSnapshot,
    stremioServerTranscode: false,
    instantPlay: true,
    inRoom: false,
    debrids: [],
    selfFrameReadyRef: { current: true },
    openPicker: vi.fn(),
    engineFailure: false,
    isP2pEngine: false,
    engineStats: null,
  });
  return null;
}

it("does not watch a file on this computer for a start that never comes", () => {
  // 17 October: after a downloaded episode stopped, "local file: skipping
  // auto-retry (source did not start after 75s)" was logged every second.
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const root = createRoot(document.createElement("div"));
  const local = { url: "/Users/me/Downloads/Show - S04E04.mkv", meta: { id: "tt1" } } as unknown as PlayerSrc;
  act(() => root.render(<Probe src={local} />));
  act(() => vi.advanceTimersByTime(120_000));
  expect(warn.mock.calls.filter(([m]) => String(m).includes("did not start"))).toHaveLength(0);
  act(() => root.unmount());
});
