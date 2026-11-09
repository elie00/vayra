import { useEffect, useRef } from "react";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { isMacDesktop } from "@/lib/platform";

export type NowPlayingCommand =
  | { action: "play" }
  | { action: "pause" }
  | { action: "toggle" }
  | { action: "skip"; seconds: number }
  | { action: "seek"; position: number };

type Controls = {
  snap: PlayerSnapshot;
  playPauseToggle: () => void;
  seekStep: (delta: number) => void;
  seekTo: (sec: number) => void;
};

export function runNowPlayingCommand(command: NowPlayingCommand, controls: Controls): void {
  const playing = controls.snap.status === "playing";
  switch (command.action) {
    case "play":
      if (!playing) controls.playPauseToggle();
      return;
    case "pause":
      if (playing) controls.playPauseToggle();
      return;
    case "toggle":
      controls.playPauseToggle();
      return;
    case "skip":
      controls.seekStep(command.seconds);
      return;
    case "seek":
      controls.seekTo(command.position);
  }
}

/**
 * Control Center, media keys and headphones drive the player through the same
 * controls as its keyboard shortcuts, so casts and watch rooms follow.
 */
export function useNowPlayingCommands(controls: Controls): void {
  const ref = useRef(controls);
  ref.current = controls;
  useEffect(() => {
    if (!isMacDesktop()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<NowPlayingCommand>("vayra:now-playing-command", (e) => runNowPlayingCommand(e.payload, ref.current)),
      )
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
