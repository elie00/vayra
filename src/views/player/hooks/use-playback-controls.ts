import { useCallback, type RefObject } from "react";
import type { CastDeviceInfo } from "@/lib/cast";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { writePlayerPrefs } from "@/lib/player-prefs";
import type { RoomCommand } from "@/lib/together/protocol";
import type { VeyaSender } from "./use-veya-sync";

export function usePlaybackControls(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  snapRef: RefObject<PlayerSnapshot>;
  metaId: string;
  inRoom: boolean;
  isHost: boolean;
  hasStarted: boolean;
  canControl: boolean;
  castDevice: CastDeviceInfo | null;
  startHost: () => void;
  togglePlayCast: () => Promise<void>;
  seekCast: (sec: number) => Promise<void>;
  sendCommand: (command: RoomCommand) => void;
  remoteVeya?: {
    active: boolean;
    send: VeyaSender;
  };
}) {
  const {
    bridgeRef,
    snapRef,
    metaId,
    inRoom,
    isHost,
    hasStarted,
    canControl,
    castDevice,
    startHost,
    togglePlayCast,
    seekCast,
    sendCommand,
    remoteVeya,
  } = params;

  const rememberSubChoice = useCallback(
    (t: { lang?: string } | null | undefined) => {
      if (t) writePlayerPrefs(metaId, t.lang ? { subLang: t.lang, subsOff: false } : { subsOff: false });
      else writePlayerPrefs(metaId, { subsOff: true });
    },
    [metaId],
  );

  const cycleSubtitles = () => {
    const subs = snapRef.current.subtitleTracks;
    const idx = subs.findIndex((t) => t.selected);
    const off = idx === -1;
    if (subs.length === 0) return;
    if (off) {
      bridgeRef.current?.setSubtitleTrack(subs[0].id);
      rememberSubChoice(subs[0]);
      return;
    }
    const next = idx + 1;
    if (next >= subs.length) {
      bridgeRef.current?.setSubtitleTrack(null);
      rememberSubChoice(null);
    } else {
      bridgeRef.current?.setSubtitleTrack(subs[next].id);
      rememberSubChoice(subs[next]);
    }
  };

  const playPauseToggle = () => {
    if (inRoom && isHost && !hasStarted) {
      startHost();
      return;
    }
    if (castDevice) {
      void togglePlayCast();
      return;
    }
    if (!canControl) return;
    if (remoteVeya?.active) {
      const action = snapRef.current.status === "playing" ? "pause" : "play";
      remoteVeya.send({ action, atMs: Date.now() });
      const b = bridgeRef.current;
      if (!b) return;
      if (action === "pause") b.pause();
      else b.play().catch(() => {});
      return;
    }
    if (inRoom && !isHost) {
      sendCommand(snapRef.current.status === "playing" ? { action: "pause" } : { action: "play" });
      return;
    }
    const b = bridgeRef.current;
    if (!b) return;
    if (snapRef.current.status === "playing") b.pause();
    else b.play().catch(() => {});
  };

  const seekStep = (delta: number) => {
    const pos = getPlaybackPosition();
    if (castDevice) {
      void seekCast(Math.max(0, pos + delta));
      return;
    }
    if (!canControl) return;
    const target = Math.max(0, pos + delta);
    if (remoteVeya?.active) {
      remoteVeya.send({ action: "seek", positionSeconds: target, atMs: Date.now() });
      bridgeRef.current?.seek(target);
      return;
    }
    if (inRoom && !isHost) {
      sendCommand({ action: "seek", positionSeconds: target });
      return;
    }
    bridgeRef.current?.seek(target);
  };

  const seekTo = useCallback(
    (sec: number) => {
      if (castDevice) {
        void seekCast(Math.max(0, sec));
        return;
      }
      if (!canControl) return;
      const target = Math.max(0, sec);
      if (remoteVeya?.active) {
        remoteVeya.send({ action: "seek", positionSeconds: target, atMs: Date.now() });
        bridgeRef.current?.seek(target);
        return;
      }
      if (inRoom && !isHost) {
        sendCommand({ action: "seek", positionSeconds: target });
        return;
      }
      bridgeRef.current?.seek(target);
    },
    [castDevice, canControl, remoteVeya, inRoom, isHost, sendCommand, seekCast, bridgeRef],
  );

  return { rememberSubChoice, cycleSubtitles, playPauseToggle, seekStep, seekTo };
}
