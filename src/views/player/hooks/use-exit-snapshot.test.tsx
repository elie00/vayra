// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerSrc } from "@/lib/view";

const captureMpvFrame = vi.hoisted(() => vi.fn(async () => "data:image/jpeg;base64,x"));
vi.mock("@/lib/snapshots", () => ({ captureFrame: vi.fn(), captureMpvFrame, saveSnapshot: vi.fn() }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { cwSnapshotFullQuality: false } }) }));
vi.mock("@/lib/trickplay", () => ({ trickplayGet: vi.fn() }));
vi.mock("@/lib/player/playback-clock", () => ({ getPlaybackPosition: () => 1800 }));
vi.mock("@/lib/stremio", () => ({ cloudWriteId: (id: string) => id }));

import { useExitSnapshot } from "./use-exit-snapshot";

afterEach(() => vi.unstubAllGlobals());

function Probe({ rendered }: { rendered: boolean }) {
  useExitSnapshot({
    src: { meta: { id: "tt1234567" }, url: "http://127.0.0.1:1/stream/a/0" } as unknown as PlayerSrc,
    engine: "mpv",
    status: "playing",
    rendered,
    durationSec: 3300,
    videoMountRef: createRef<HTMLDivElement>(),
    resolvedImdbId: null,
    resolvedImdbVerified: false,
    seekPreviewEnabled: false,
  });
  return null;
}

it("waits for the first frame before capturing one", async () => {
  // A resume reports "playing" at its position before mpv has a frame: the capture
  // then failed with rc=-12 on every load.
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe rendered={false} />));
  expect(captureMpvFrame).not.toHaveBeenCalled();
  await act(async () => root.render(<Probe rendered />));
  expect(captureMpvFrame).toHaveBeenCalled();
  act(() => root.unmount());
});
