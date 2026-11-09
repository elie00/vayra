import { useEffect, useMemo, useRef, type RefObject } from "react";
import { createConnectPublisher, onConnectCommand, type ConnectCommand } from "@/lib/connect/host";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition, subscribePlaybackClock } from "@/lib/player/playback-clock";
import type { PlayerSrc } from "@/lib/view";
import { runNowPlayingCommand } from "./use-now-playing-commands";

type Controls = {
  snap: PlayerSnapshot;
  bridgeRef: RefObject<PlayerBridge | null>;
  playPauseToggle: () => void;
  seekStep: (delta: number) => void;
  seekTo: (sec: number) => void;
  closePlayer: () => void;
};

/** Runs a paired phone's playback command; `load` is the app's, not the player's. */
export function runConnectCommand(command: ConnectCommand, controls: Controls): void {
  if (command.type !== "command") return;
  switch (command.action) {
    case "play":
    case "pause":
    case "toggle":
      runNowPlayingCommand({ action: command.action }, controls);
      return;
    case "seek":
      controls.seekTo(command.position);
      return;
    case "skip":
      controls.seekStep(command.seconds);
      return;
    case "volume":
      controls.bridgeRef.current?.setVolume(command.level);
      if (command.level > 0 && controls.snap.muted) controls.bridgeRef.current?.setMuted(false);
      return;
    case "stop":
      controls.closePlayer();
  }
}

function connectMedia(src: PlayerSrc) {
  const name = src.meta.name ?? src.title ?? "";
  const episode = src.episode ? { season: src.episode.season, episode: src.episode.episode } : undefined;
  return {
    title: src.episode
      ? `${name} · S${src.episode.season}E${src.episode.episode}${src.episode.name ? ` · ${src.episode.name}` : ""}`
      : name,
    meta: {
      id: src.meta.id,
      type: src.meta.type === "series" || src.episode ? ("series" as const) : ("movie" as const),
      name,
      poster: src.meta.poster ?? undefined,
    },
    episode,
  };
}

/**
 * VAYRA Connect on the Mac: paired phones see this player's state and drive it
 * through the same controls as its keyboard shortcuts, so casts and rooms follow.
 */
export function useConnectHost(params: Controls & { enabled: boolean; src: PlayerSrc }): void {
  const { enabled, src, snap } = params;
  const publisher = useMemo(() => createConnectPublisher(), []);
  const media = useMemo(() => connectMedia(src), [src]);
  const controlsRef = useRef<Controls>(params);
  controlsRef.current = params;

  // `snap` ignores the clock (it would re-render the player on every tick), so
  // the position comes from the playback clock: that is how seeks reach phones.
  useEffect(() => {
    if (!enabled) {
      publisher.clear();
      return;
    }
    const publish = () => publisher.update({ ...snap, positionSec: getPlaybackPosition() }, media);
    publish();
    return subscribePlaybackClock(publish);
  }, [enabled, publisher, snap, media]);

  useEffect(() => () => publisher.clear(), [publisher]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    onConnectCommand((command) => runConnectCommand(command, controlsRef.current))
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => { /* Outside Tauri no phone can send commands. */ });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [enabled]);
}
