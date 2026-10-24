import { expect, it, vi } from "vitest";
import { emptySnapshot, type PlayerBridge } from "@/lib/player/bridge";
import { runConnectCommand } from "./use-connect-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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
