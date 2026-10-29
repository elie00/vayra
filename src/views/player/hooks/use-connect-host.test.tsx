// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { emptySnapshot, type PlayerBridge } from "@/lib/player/bridge";
import { setPlaybackClock } from "@/lib/player/playback-clock";
import type { PlayerSrc } from "@/lib/view";
import { runConnectCommand, useConnectHost } from "./use-connect-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

function controls(muted = false) {
  const bridge = { setVolume: vi.fn(), setMuted: vi.fn() } as unknown as PlayerBridge;
  return {
    snap: { ...emptySnapshot, status: "playing" as const, muted },
    bridgeRef: { current: bridge },
    playPauseToggle: vi.fn(),
    seekStep: vi.fn(),
    seekTo: vi.fn(),
    closePlayer: vi.fn(),
  };
}

it("drives the player through its own controls", () => {
  const c = controls();
  runConnectCommand({ type: "command", action: "pause" }, c);
  runConnectCommand({ type: "command", action: "play" }, c);
  runConnectCommand({ type: "command", action: "seek", position: 754 }, c);
  runConnectCommand({ type: "command", action: "skip", seconds: -10 }, c);
  runConnectCommand({ type: "command", action: "stop" }, c);
  expect(c.playPauseToggle).toHaveBeenCalledTimes(1);
  expect(c.seekTo).toHaveBeenCalledWith(754);
  expect(c.seekStep).toHaveBeenCalledWith(-10);
  expect(c.closePlayer).toHaveBeenCalledTimes(1);
});

it("sets the volume and unmutes when it goes up from mute", () => {
  const c = controls(true);
  runConnectCommand({ type: "command", action: "volume", level: 0.4 }, c);
  expect(c.bridgeRef.current?.setVolume).toHaveBeenCalledWith(0.4);
  expect(c.bridgeRef.current?.setMuted).toHaveBeenCalledWith(false);
});

it("leaves requests to play a title to the app", () => {
  const c = controls();
  runConnectCommand({ type: "load", meta: { id: "tt1", type: "movie", name: "Film" } }, c);
  expect(c.playPauseToggle).not.toHaveBeenCalled();
  expect(c.seekTo).not.toHaveBeenCalled();
});

it("tells phones about a seek, which only moves the playback clock", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const c = controls();
  const src = { meta: { id: "tt1", type: "movie", name: "Film" }, url: "http://x/film.mp4", title: "Film" } as PlayerSrc;
  const snap = { ...c.snap, positionSec: 100, durationSec: 5000, rate: 1 };
  function Host() {
    useConnectHost({ ...c, snap, enabled: true, src });
    return null;
  }
  setPlaybackClock(100, 0);
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Host />));
  act(() => setPlaybackClock(1300, 0));
  const published = vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "connect_publish");
  expect(published.at(-1)?.[1]).toMatchObject({ state: { positionSec: 1300 } });
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
