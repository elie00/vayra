import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayEpisode } from "@/lib/view";
import { useFrameGrab } from "./use-frame-grab";
import { useGifRecorder } from "./use-gif-recorder";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { useLiveChannelOverlay } from "./use-live-channel-overlay";
import { useSleepTimer } from "./use-sleep-timer";
import { useVideoFill } from "./use-video-fill";

export function usePlayerHotkeys(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  snap: PlayerSnapshot;
  metaId: string;
  drawMode: boolean;
  setDrawMode: Dispatch<SetStateAction<boolean>>;
  closePlayer: () => Promise<void>;
  playPauseToggle: () => void;
  seekStep: (delta: number) => void;
  seekTo: (sec: number) => void;
  toggleFullscreen: () => void;
  fullscreen: boolean;
  cycleSubtitles: () => void;
  canChangeEpisode: boolean;
  adjacent: { prev: PlayEpisode | null; next: PlayEpisode | null };
  goToEpisode: (ep: PlayEpisode | null) => void;
  toggleSwitcher: () => void;
  toggleEpisodePanel: () => void;
  liveOverlay: ReturnType<typeof useLiveChannelOverlay>;
  toggleDvr: () => void;
  sleep: ReturnType<typeof useSleepTimer>;
  quickToolsEnabled: boolean;
  frameGrab: ReturnType<typeof useFrameGrab>;
  gif: ReturnType<typeof useGifRecorder>;
  videoFill: ReturnType<typeof useVideoFill>;
  onToggleAnime4k?: () => void;
}) {
  const {
    bridgeRef,
    snap,
    metaId,
    drawMode,
    setDrawMode,
    closePlayer,
    playPauseToggle,
    seekStep,
    seekTo,
    toggleFullscreen,
    fullscreen,
    cycleSubtitles,
    canChangeEpisode,
    adjacent,
    goToEpisode,
    toggleSwitcher,
    toggleEpisodePanel,
    liveOverlay,
    toggleDvr,
    sleep,
    quickToolsEnabled,
    frameGrab,
    gif,
    videoFill,
    onToggleAnime4k,
  } = params;

  const [showStats, setShowStats] = useState(false);
  const { holdSpeedActive } = useKeyboardShortcuts({
    bridgeRef,
    snap,
    drawMode,
    setDrawMode,
    closePlayer,
    playPauseToggle,
    seekStep,
    seekTo,
    toggleFullscreen,
    fullscreen,
    cycleSubtitles,
    setShowStats,
    metaId,
    onNextEp: canChangeEpisode && adjacent.next ? () => goToEpisode(adjacent.next) : undefined,
    onPrevEp: canChangeEpisode && adjacent.prev ? () => goToEpisode(adjacent.prev) : undefined,
    hasNextEp: canChangeEpisode && !!adjacent.next,
    hasPrevEp: canChangeEpisode && !!adjacent.prev,
    toggleSwitcher,
    toggleEpisodePanel,
    toggleGuide: () => {
      if (liveOverlay.isLive) liveOverlay.setOpen((o) => !o);
    },
    toggleDvr: () => {
      if (liveOverlay.isLive) toggleDvr();
    },
    toggleSleep: () =>
      sleep.mode.kind === "off" ? sleep.set({ kind: "end_episode" }) : sleep.cancel(),
    onScreenshot: quickToolsEnabled ? () => frameGrab.trigger() : undefined,
    onGifRecord: quickToolsEnabled ? () => gif.toggle() : undefined,
    onToggleCrop: () => videoFill.cycle(),
    onPanscanUp: () => videoFill.step(0.1),
    onPanscanDown: () => videoFill.step(-0.1),
    onPrevChannel: liveOverlay.isLive ? liveOverlay.goPrevChannel : undefined,
    onToggleAnime4k,
  });

  return { holdSpeedActive, showStats };
}
