import { expect, it, vi } from "vitest";
import { emptySnapshot } from "@/lib/player/bridge";
import { runNowPlayingCommand, type NowPlayingCommand } from "./use-now-playing-commands";

function controls(status: "playing" | "paused") {
  return {
    snap: { ...emptySnapshot, status },
    playPauseToggle: vi.fn(),
    seekStep: vi.fn(),
    seekTo: vi.fn(),
  };
}

it("plays or pauses only when that changes something", () => {
  const playing = controls("playing");
  runNowPlayingCommand({ action: "play" }, playing);
  runNowPlayingCommand({ action: "pause" }, playing);
  expect(playing.playPauseToggle).toHaveBeenCalledTimes(1);

  const paused = controls("paused");
  runNowPlayingCommand({ action: "pause" }, paused);
  runNowPlayingCommand({ action: "play" }, paused);
  runNowPlayingCommand({ action: "toggle" }, paused);
  expect(paused.playPauseToggle).toHaveBeenCalledTimes(2);
});

it("skips and seeks through the player controls", () => {
  const c = controls("playing");
  const commands: NowPlayingCommand[] = [
    { action: "skip", seconds: -10 },
    { action: "seek", position: 1856 },
  ];
  commands.forEach((command) => runNowPlayingCommand(command, c));
  expect(c.seekStep).toHaveBeenCalledWith(-10);
  expect(c.seekTo).toHaveBeenCalledWith(1856);
});
