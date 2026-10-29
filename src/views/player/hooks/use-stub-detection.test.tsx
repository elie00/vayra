// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";
import { useStubDetection } from "./use-stub-detection";

vi.mock("@/lib/dead-streams", () => ({
  SHORT_PLAYBACK_SEC: 120,
  STUB_TTL_MS: 1,
  shouldFlagAsStub: () => true,
  markStreamDead: vi.fn(),
  recordStubEvent: vi.fn(),
}));

afterEach(() => { vi.unstubAllGlobals(); });

async function stubCalls(url: string, id = "tt0000001"): Promise<number> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onStub = vi.fn();
  const src = { url, meta: { id, type: "movie", name: "Short clip" }, title: "Short clip" } as PlayerSrc;
  const snap = { status: "playing", durationSec: 10 } as PlayerSnapshot;
  function Probe() {
    useStubDetection({ src, snap, onStub, instantPlay: true });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => root.unmount());
  return onStub.mock.calls.length;
}

it("returns a short addon stream to the picker", async () => {
  expect(await stubCalls("https://streams.example.invalid/movie.mp4")).toBe(1);
});

it("plays a short file the user opened from disk", async () => {
  expect(await stubCalls("C:\\Users\\viewer\\Videos\\clip.mp4")).toBe(0);
  expect(await stubCalls("/Users/viewer/Movies/clip.mp4")).toBe(0);
});

it("plays a short clip from a link the user pasted", async () => {
  const url = "https://media.example.invalid/clip.mp4";
  expect(await stubCalls(url, `url:${url}`)).toBe(0);
});
