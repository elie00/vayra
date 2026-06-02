import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarDock } from "@/components/player/avatar-dock";
import { ChatOverlay } from "@/components/player/chat-overlay";
import {
  PANEL_META,
  PLAYER_CHROME_CHANGED_EVENT,
  readPlayerChromeConfig,
  type PanelCorner,
  type PlayerChromeConfig,
} from "@/lib/player-chrome";
import { activeLayout } from "@/lib/theme";
import { DrawCanvas, StrokesLayer } from "@/components/player/draw-canvas";
import { StreamSwitcher } from "@/components/player/stream-switcher";
import { SubtitleOverlay } from "@/components/player/subtitle-overlay";
import { getPlayerShell } from "@/lib/player-shells/registry";
import { type PlayerBridge } from "@/lib/player/bridge";
import { useDebridClients } from "@/lib/debrid/registry";
import { useSettings } from "@/lib/settings";
import { saveResumeMs } from "@/lib/resume";
import { savePlayback } from "@/lib/playback-history";
import { captureFrame, captureMpvFrame, saveSnapshot } from "@/lib/snapshots";
import { readPlayerVolume, writePlayerVolume } from "@/lib/player-volume";
import { nameColor } from "@/lib/together/colors";
import { useTogether } from "@/lib/together/provider";
import { buildPlayInvite } from "@/lib/together/build-invite";
import { useView, type PlayerSrc, type PlayEpisode } from "@/lib/view";
import { writePlayerPrefs } from "@/lib/player-prefs";
import { activeSegment, useSkipSegments } from "@/lib/skip-intro";
import { CastMenu } from "@/components/player/cast-menu";
import { ResumePrompt } from "@/components/player/resume-prompt";
import { QuickTools } from "@/components/player/quick-tools";
import { SkipPill } from "@/components/player/skip-pill";
import { StatsOverlay } from "@/components/player/stats-overlay";
import { LiveChannelOverlay } from "@/components/player/live-channel-overlay/overlay";
import { LiveChannelDvr } from "@/components/player/live-channel-dvr";
import { StreamCheckPill } from "@/components/player/stream-check-pill";
import { isLocalUrl } from "@/lib/player/local-url";
import { isMacDesktop } from "@/lib/platform";
import {
  checkStreamCompat,
  getDeviceCaps,
  pickBestCompatStream,
  pickTranscodeProfile,
  type DeviceCaps,
} from "@/lib/cast/device-caps";
import { peekPickerCache } from "@/lib/picker-cache";
import { resolveStream } from "@/lib/streams/resolve";
import { registerStreamProxy } from "@/lib/stream-proxy";
import type { ScoredStream } from "@/lib/streams/types";
import { isFfmpegPresent, type CastDeviceInfo, type TranscodeProfile } from "@/lib/cast";

type CastResolution =
  | { kind: "compat"; url: string; caps: DeviceCaps }
  | { kind: "swapped"; url: string; alt: ScoredStream; caps: DeviceCaps; reasons: string[] }
  | {
      kind: "transcode";
      url: string;
      caps: DeviceCaps;
      profile: TranscodeProfile;
      reasons: string[];
    }
  | { kind: "needs-ffmpeg"; caps: DeviceCaps; reasons: string[] }
  | { kind: "incompatible"; caps: DeviceCaps; reasons: string[]; candidatesChecked: number };

function urlNeedsRemuxForCast(url: string, kind: string): boolean {
  if (kind !== "chromecast" && kind !== "dlna" && kind !== "roku") return false;
  const path = (url.split("?")[0] || "").toLowerCase();
  return (
    path.endsWith(".mp4") ||
    path.endsWith(".m4v") ||
    path.endsWith(".mkv") ||
    path.endsWith(".avi") ||
    path.endsWith(".mov")
  );
}

async function resolveCompatibleCastUrl(
  src: PlayerSrc,
  device: CastDeviceInfo,
  debrids: ReturnType<typeof useDebridClients>,
  liveDims: { width: number; height: number },
): Promise<CastResolution> {
  const caps = getDeviceCaps(device);
  const augmented = src.streamRef
    ? { ...src.streamRef, liveWidth: liveDims.width, liveHeight: liveDims.height }
    : { liveWidth: liveDims.width, liveHeight: liveDims.height };
  const currentCompat = checkStreamCompat(augmented, caps);
  if (currentCompat.ok) {
    if (urlNeedsRemuxForCast(src.url, device.kind)) {
      const ffmpegOk = await isFfmpegPresent();
      if (ffmpegOk) {
        const profile = pickTranscodeProfile(augmented, caps);
        return {
          kind: "transcode",
          url: src.url,
          caps,
          profile: { ...profile, force_h264: false, force_aac: false },
          reasons: ["remux to MPEGTS for reliable cast playback (avoids moov-atom-at-end issues)"],
        };
      }
    }
    return { kind: "compat", url: src.url, caps };
  }
  const cached = peekPickerCache(src.meta, src.episode);
  const candidates: ScoredStream[] = cached?.result.picker.all ?? [];
  const alt = pickBestCompatStream(candidates, caps);
  if (alt) {
    const ac = new AbortController();
    const r = await resolveStream(alt, debrids, ac.signal);
    if (r.ok) {
      let url = r.data.url;
      if (r.data.headers && Object.keys(r.data.headers).length > 0) {
        try {
          const proxied = await registerStreamProxy(r.data.url, r.data.headers);
          url = proxied.url;
        } catch {
          url = "";
        }
      }
      if (url) {
        return { kind: "swapped", url, alt, caps, reasons: currentCompat.reasons };
      }
    }
  }
  const ffmpegOk = await isFfmpegPresent();
  if (ffmpegOk) {
    const profile = pickTranscodeProfile(augmented, caps);
    return {
      kind: "transcode",
      url: src.url,
      caps,
      profile,
      reasons: currentCompat.reasons,
    };
  }
  return {
    kind: "needs-ffmpeg",
    caps,
    reasons: currentCompat.reasons,
  };
}
import { guessContentType } from "@/lib/cast";
import { useAuth } from "@/lib/auth";
import { EpisodePanel } from "@/components/player/episode-panel";
import { CinematicPlayerLoader } from "./player/cinematic-player-loader";
import { CastSessionBar } from "./player/cast-session-bar";
import { CastingOverlay } from "./player/casting-overlay";
import { CastErrorModal } from "./player/cast-error-modal";
import { DragClickStage } from "./player/drag-click-stage";
import { WaitingForRoom } from "./player/waiting-for-room";
import { HeaderWarning } from "./player/header-warning";
import { ForeignNoticeBox } from "./player/foreign-notice-box";
import { LocalFileError } from "./player/local-file-error";
import { useFullscreen } from "./player/hooks/use-fullscreen";
import { useCastSession } from "./player/hooks/use-cast-session";
import { useEverPlayed } from "./player/hooks/use-ever-played";
import { useDrawMode } from "./player/hooks/use-draw-mode";
import { useChromeVisibility } from "./player/hooks/use-chrome-visibility";
import { useKeyboardShortcuts } from "./player/hooks/use-keyboard-shortcuts";
import { useAutoRetry } from "./player/hooks/use-auto-retry";
import { useTrackAutoload } from "./player/hooks/use-track-autoload";
import { useTraktScrobble } from "@/lib/trakt/scrobble-hook";
import { useVideoDownload } from "./player/hooks/use-video-download";
import { setPlayerActions } from "@/lib/player-actions";
import { useRoomSync } from "./player/hooks/use-room-sync";
import { useLiveChannelOverlay } from "./player/hooks/use-live-channel-overlay";
import { useStreamSwitcher } from "./player/hooks/use-stream-switcher";
import { useMpvEmbed } from "./player/hooks/use-mpv-embed";
import { setPlaybackPresence } from "@/lib/discord/presence";
import { usePlayerBridge } from "./player/hooks/use-player-bridge";
import { useWebviewMemory } from "./player/hooks/use-webview-memory";
import { useEpisodeNavigation } from "./player/hooks/use-episode-navigation";
import { useAbLoop } from "./player/hooks/use-ab-loop";
import { useAutoNextEpisode } from "./player/hooks/use-auto-next-episode";
import { useFrameGrab } from "./player/hooks/use-frame-grab";
import { useSleepTimer } from "./player/hooks/use-sleep-timer";
import { useAutoEndExit } from "./player/hooks/use-auto-end-exit";
import { usePipMode } from "./player/hooks/use-pip-mode";
import { useStubDetection } from "./player/hooks/use-stub-detection";
import { useBridgeLoad } from "./player/hooks/use-bridge-load";
import { useResumeAutosave } from "./player/hooks/use-resume-autosave";
import { useStremioSync } from "./player/hooks/use-stremio-sync";

export function PlayerView({ src }: { src: PlayerSrc }) {
  const { setChromeHidden, topPath, openPicker, exitPlayback, replacePlayerSrc } = useView();
  const { settings } = useSettings();
  const chromeTheme = activeLayout(settings.theme) === "stremio" ? "stremio" : "default";
  const [chromeConfig, setChromeConfig] = useState<PlayerChromeConfig>(() =>
    readPlayerChromeConfig(chromeTheme),
  );
  useEffect(() => {
    setChromeConfig(readPlayerChromeConfig(chromeTheme));
    const refresh = () => setChromeConfig(readPlayerChromeConfig(chromeTheme));
    const onStorage = (e: StorageEvent) => {
      if (e.key === "harbor.player.chrome.profiles.v1") refresh();
    };
    window.addEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [chromeTheme]);
  const avatarsPanel = chromeConfig.panels?.avatars;
  const chatPanel = chromeConfig.panels?.chat;
  const episodesPanel = chromeConfig.panels?.episodes;
  const avatarsCorner: PanelCorner = avatarsPanel?.corner ?? PANEL_META.avatars.defaultCorner;
  const chatCorner: PanelCorner = chatPanel?.corner ?? PANEL_META.chat.defaultCorner;
  const episodesCorner: PanelCorner = episodesPanel?.corner ?? PANEL_META.episodes.defaultCorner;
  const avatarsHidden = !!avatarsPanel?.hidden;
  const chatHidden = !!chatPanel?.hidden;
  const episodesHidden = !!episodesPanel?.hidden;
  const { authKey } = useAuth();
  const debrids = useDebridClients();
  const {
    snapshot: roomSnapshot,
    publishState,
    sendCommand,
    onIncomingCommand,
    suppressOutgoingFor,
    onIncomingState,
    clientId,
    markReady,
    notifyHostLeaving,
    clearInvite,
    sendInvite,
    claimHost,
    chat,
    sendChat,
    sendDraw,
    onIncomingDraw,
    presenceMap,
    participantLocations,
    startRoom,
  } = useTogether();
  const stageRef = useRef<HTMLDivElement>(null);
  const videoMountRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<PlayerBridge | null>(null);
  const selfFrameReadyRef = useRef(false);
  const { fullscreen, toggleFullscreen } = useFullscreen(stageRef);
  const { snap, engine, bridgeReady, bridgeKey } = usePlayerBridge({
    bridgeRef,
    videoMountRef,
    src,
    settings,
  });
  useWebviewMemory(engine === "mpv");
  const shellSnapRef = useRef(snap);
  const volumeRestoredRef = useRef(false);
  useEffect(() => {
    if (!bridgeReady) {
      volumeRestoredRef.current = false;
      return;
    }
    if (volumeRestoredRef.current) return;
    if (snap.status !== "playing" && snap.status !== "paused") return;
    const b = bridgeRef.current;
    if (!b) return;
    const saved = readPlayerVolume();
    b.setVolume(saved.volume);
    b.setMuted(saved.muted);
    volumeRestoredRef.current = true;
  }, [bridgeReady, bridgeKey, snap.status]);
  const [foreignNotice, setForeignNotice] = useState<{ title: string | null; from: string } | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [castIncompatError, setCastIncompatError] = useState<string | null>(null);
  const [castTranscoding, setCastTranscoding] = useState(false);
  useEffect(() => {
    if (!castIncompatError) return;
    const t = window.setTimeout(() => setCastIncompatError(null), 8000);
    return () => window.clearTimeout(t);
  }, [castIncompatError]);
  const {
    castMenuOpen,
    castMenuAnchor,
    castDevice,
    pendingCastDevice,
    castError,
    castErrorInfo,
    setCastErrorInfo,
    dismissCastErrorInfo,
    castPlaying,
    castPositionSec,
    openCastMenu,
    closeCastMenu,
    pickCastDevice,
    togglePlayCast,
    stopCast,
    seekCast,
    castActiveRef,
    playCast,
    pauseCast,
    getCastPosition,
    isCastPlaying,
  } = useCastSession(bridgeRef);
  const [now, setNow] = useState(() => Date.now());
  const { pipMode, togglePipMode, exitPip } = usePipMode({ bridgeRef, setChromeHidden });
  const { slowLoad, transcodedUrl } = useAutoRetry({
    bridgeRef,
    src,
    snap,
    stremioServerTranscode: settings.stremioServerTranscode,
    instantPlay: settings.instantPlay,
    inRoom: roomSnapshot.state === "joined",
    selfFrameReadyRef,
    openPicker,
  });

  useEffect(() => {
    if (roomSnapshot.state !== "joined") return;
    const id = window.setInterval(() => setNow(Date.now()), 6000);
    return () => window.clearInterval(id);
  }, [roomSnapshot.state]);

  const season = src.episode?.season;
  const episode = src.episode?.episode;
  const inRoom = roomSnapshot.state === "joined" && roomSnapshot.participants.length >= 2;
  const isHost = inRoom && roomSnapshot.hostClientId === clientId;
  const canControl = !inRoom || hasStarted;
  const canPublish = inRoom && hasStarted;
  const roomFull = roomSnapshot.participants.length >= 2;

  const snapRef = useRef(snap);
  snapRef.current = snap;
  const wasCastingRef = useRef(false);
  useEffect(() => {
    const casting = !!castDevice;
    if (wasCastingRef.current && !casting && inRoom && isHost) {
      const s = snapRef.current;
      publishState({
        mediaId: src.meta.id,
        mediaTitle: src.meta.name ?? null,
        episode: src.episode
          ? { season: src.episode.season, episode: src.episode.episode, name: src.episode.name }
          : null,
        posterUrl: src.meta.poster ?? null,
        positionSeconds: s.positionSec,
        playing: s.status === "playing",
      });
    }
    wasCastingRef.current = casting;
  }, [castDevice, inRoom, isHost, publishState, src.meta.id, src.meta.name, src.meta.poster, src.episode]);

  useEffect(() => {
    if (snap.status !== "playing" && snap.status !== "paused") {
      setPlaybackPresence(null);
      return;
    }
    if (src.meta.id?.startsWith("iptv:")) return;
    const year =
      typeof src.meta.releaseInfo === "string" ? src.meta.releaseInfo.slice(0, 4) : undefined;
    const epLabel = season != null && episode != null ? `S${season} E${episode}` : undefined;
    setPlaybackPresence({
      title: src.meta.name ?? "Untitled",
      subtitle: epLabel || year,
      posterUrl: src.meta.poster ?? undefined,
      year,
      paused: snap.status === "paused",
      positionSec: snap.positionSec,
      durationSec: snap.durationSec,
    });
  }, [
    snap.status,
    snap.positionSec,
    snap.durationSec,
    src.meta.id,
    src.meta.name,
    src.meta.poster,
    src.meta.releaseInfo,
    src.liveProgram,
    season,
    episode,
  ]);

  useEffect(() => () => setPlaybackPresence(null), []);
  const everyoneReady = useMemo(
    () =>
      roomSnapshot.participants.length > 0 &&
      roomSnapshot.participants.every((p) => p.ready),
    [roomSnapshot.participants],
  );
  const notReady = useMemo(
    () => roomSnapshot.participants.filter((p) => !p.ready),
    [roomSnapshot.participants],
  );
  const showWaiting = inRoom && !hasStarted;
  const selfName = useMemo(
    () => roomSnapshot.participants.find((p) => p.id === clientId)?.name ?? "You",
    [roomSnapshot.participants, clientId],
  );
  const selfColor = settings.harborColor || nameColor(selfName);
  const playing = snap.status === "playing";

  const {
    drawMode,
    setDrawMode,
    hideOthersDrawings,
    setHideOthersDrawings,
    strokes,
    onDrawStart,
    onDrawPoint,
    onDrawEnd,
  } = useDrawMode({
    inRoom,
    participantCount: roomSnapshot.participants.length,
    clientId,
    topPath,
    onIncomingDraw,
    sendDraw,
  });

  const { chromeVisible, wakeChrome, anyMenuOpen, setAnyMenuOpen, cursorStyle } = useChromeVisibility({
    playing,
    drawMode,
    pipMode,
    setChromeHidden,
  });

  const { adjacent, swappingEp, goToEpisode } = useEpisodeNavigation({
    src,
    settings,
    debrids,
    authKey,
    inRoom,
    isHost,
    sendInvite,
    claimHost,
    replacePlayerSrc,
    openPicker,
  });

  const canChangeEpisode = src.meta.type === "series" && (!inRoom || isHost);
  const roomGuest = inRoom && !isHost;
  const broadcastEpisode = useCallback(
    (ep: PlayEpisode) => {
      if (!inRoom || !isHost) return;
      claimHost(true);
      sendInvite(buildPlayInvite(src.meta, ep));
    },
    [inRoom, isHost, claimHost, sendInvite, src.meta],
  );

  const [autoNextCancelled, setAutoNextCancelled] = useState(false);
  useEffect(() => {
    setAutoNextCancelled(false);
  }, [src.url]);

  useAutoNextEpisode({
    src,
    snap,
    nextEp: adjacent.next,
    canChangeEpisode,
    cancelled: autoNextCancelled,
    goToEpisode,
  });

  const quickToolsEnabled = !inRoom || isHost;
  const ab = useAbLoop({
    bridgeRef,
    positionSec: snap.positionSec,
    durationSec: snap.durationSec,
    enabled: quickToolsEnabled,
    resetKey: src.url,
  });
  const sleep = useSleepTimer({
    bridgeRef,
    status: snap.status,
    positionSec: snap.positionSec,
    durationSec: snap.durationSec,
    srcUrl: src.url,
  });
  const frameGrab = useFrameGrab({
    bridgeRef,
    src,
    positionSec: snap.positionSec,
    enabled: quickToolsEnabled,
  });

  const { resolvedImdbId } = useTrackAutoload({
    bridgeRef,
    src,
    snap,
    engine,
    settings,
    authKey,
  });

  useTraktScrobble({ src, snap });
  const download = useVideoDownload({ url: src.url, meta: src.meta, episode: src.episode });

  useEffect(() => {
    setPlayerActions({
      download: download.start,
      toggleFullscreen,
      canDownload: !!src.url,
    });
    return () => setPlayerActions(null);
  }, [download.start, toggleFullscreen, src.url]);

  const {
    streamCheckOpen,
    setStreamCheckOpen,
    switcherOpen,
    setSwitcherOpen,
    swapResolvingKey,
    liveUrl,
    liveStreamRef,
    pickAnother,
    onSwitchStream,
  } = useStreamSwitcher({
    bridgeRef,
    src,
    snap,
    debrids,
    openPicker,
  });
  const liveOverlay = useLiveChannelOverlay({
    src,
    replacePlayerSrc,
  });

  useEffect(() => {
    if (!(src.meta.id?.startsWith("iptv:") ?? false)) return;
    if (snap.status !== "playing" && snap.status !== "paused") {
      setPlaybackPresence(null);
      return;
    }
    if (liveOverlay.open) {
      setPlaybackPresence({
        title: "Browsing the TV guide",
        subtitle: "Live TV",
        paused: false,
        positionSec: 0,
        durationSec: 0,
      });
      return;
    }
    const lead = src.liveProgram || src.meta.name || "Live TV";
    setPlaybackPresence({
      title: `Live · ${lead}`,
      subtitle: src.liveProgram ? src.meta.name : undefined,
      posterUrl: src.meta.poster ?? undefined,
      paused: snap.status === "paused",
      positionSec: 0,
      durationSec: 0,
    });
  }, [
    liveOverlay.open,
    snap.status,
    src.meta.id,
    src.meta.name,
    src.meta.poster,
    src.liveProgram,
  ]);

  const [dvrOpen, setDvrOpen] = useState(false);
  const pickAnotherOrGuide = useCallback(() => {
    if (liveOverlay.isLive) {
      liveOverlay.setOpen(true);
    } else {
      pickAnother();
    }
  }, [liveOverlay, pickAnother]);

  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const isSeriesPlayback = !!src.episode && src.meta.type === "series";

  const showHeaderWarning =
    src.notWebReady === true && engine === "html5" && (snap.status === "error" || snap.status === "loading");

  const closePlayer = useCallback(async () => {
    const b = bridgeRef.current;
    if (b && videoMountRef.current) {
      let snapImg: string | null = null;
      if (engine === "html5") {
        const v = videoMountRef.current.querySelector("video") as HTMLVideoElement | null;
        if (v) snapImg = captureFrame(v);
      } else if (engine === "mpv") {
        snapImg = await captureMpvFrame();
      }
      if (snapImg) {
        saveSnapshot(src.meta.id, snapImg);
        if (resolvedImdbId && resolvedImdbId !== src.meta.id) {
          saveSnapshot(resolvedImdbId, snapImg);
        }
      }
      if (Number.isFinite(snap.positionSec) && snap.positionSec > 0) {
        saveResumeMs(src.meta.id, snap.positionSec * 1000, season, episode);
        if (liveStreamRef) {
          savePlayback(
            src.meta.id,
            { ...liveStreamRef, url: liveUrl || src.url, title: src.meta.name },
            season,
            episode,
          );
        }
      }
    }
    await exitPip();
    if (castActiveRef.current) await stopCast().catch(() => {});
    if (inRoom && isHost) {
      publishState({
        mediaId: null,
        mediaTitle: null,
        episode: null,
        posterUrl: null,
        positionSeconds: 0,
        playing: false,
      });
      notifyHostLeaving();
      clearInvite();
    }
    exitPlayback();
  }, [exitPlayback, src.meta.id, season, episode, inRoom, isHost, notifyHostLeaving, clearInvite, publishState, snap.positionSec, exitPip, engine, liveStreamRef, liveUrl, src.url, resolvedImdbId, stopCast, castActiveRef]);

  useKeyboardShortcuts({
    bridgeRef,
    snap,
    drawMode,
    setDrawMode,
    closePlayer,
    playPauseToggle: () => playPauseToggle(),
    seekStep: (d) => seekStep(d),
    toggleFullscreen: () => toggleFullscreen(),
    cycleSubtitles: () => cycleSubtitles(),
    setShowStats,
    metaId: src.meta.id,
    onNextEp: canChangeEpisode && adjacent.next ? () => goToEpisode(adjacent.next) : undefined,
    onPrevEp: canChangeEpisode && adjacent.prev ? () => goToEpisode(adjacent.prev) : undefined,
    hasNextEp: canChangeEpisode && !!adjacent.next,
    hasPrevEp: canChangeEpisode && !!adjacent.prev,
    toggleSwitcher: () => setSwitcherOpen((v) => !v),
    toggleEpisodePanel: () => setEpisodePanelOpen((v) => !v),
    toggleGuide: () => {
      if (liveOverlay.isLive) liveOverlay.setOpen((o) => !o);
    },
    toggleDvr: () => {
      if (liveOverlay.isLive) setDvrOpen((v) => !v);
    },
    toggleSleep: () =>
      sleep.mode.kind === "off" ? sleep.set({ kind: "end_episode" }) : sleep.cancel(),
  });

  const cycleSubtitles = () => {
    const subs = snap.subtitleTracks;
    const idx = subs.findIndex((t) => t.selected);
    const off = idx === -1;
    if (subs.length === 0) return;
    if (off) {
      bridgeRef.current?.setSubtitleTrack(subs[0].id);
      return;
    }
    const next = idx + 1;
    if (next >= subs.length) {
      bridgeRef.current?.setSubtitleTrack(null);
    } else {
      bridgeRef.current?.setSubtitleTrack(subs[next].id);
    }
  };

  const { inRoomRef, isHostRef, expectedRoomPlayingRef } = useRoomSync({
    inRoom,
    isHost,
    canPublish,
    hasStarted,
    setHasStarted,
    everyoneReady,
    roomFull,
    startRoom,
    selfFrameReadyRef,
    roomSnapshot,
    clientId,
    src,
    snap,
    bridgeRef,
    publishState,
    onIncomingState,
    onIncomingCommand,
    markReady,
    suppressOutgoingFor,
    setForeignNotice,
    cast: {
      activeRef: castActiveRef,
      play: playCast,
      pause: pauseCast,
      seek: seekCast,
      getPosition: getCastPosition,
      isPlaying: isCastPlaying,
    },
  });

  const { pendingResumeSec, acknowledgeResume, pendingSeekSec, clearPendingSeek } = useBridgeLoad({
    bridgeRef,
    inRoomRef,
    isHostRef,
    bridgeReady,
    bridgeKey,
    src,
    transcodedUrl,
    season,
    episode,
    authKey,
  });

  useEffect(() => {
    if (pendingSeekSec == null) return;
    if (snap.durationSec <= 0) return;
    const b = bridgeRef.current;
    if (!b) return;
    const target = pendingSeekSec;
    clearPendingSeek();
    const t = target <= 5 ? 0 : Math.min(target, snap.durationSec - 1);
    b.seek(t);
    if (!inRoomRef.current) b.play().catch(() => {});
  }, [pendingSeekSec, snap.durationSec, clearPendingSeek]);

  useResumeAutosave({ src, snap, season, episode });
  useStremioSync({ src, snap, authKey, resolvedImdbId });

  const playPauseToggle = () => {
    if (castDevice) {
      void togglePlayCast();
      return;
    }
    if (!canControl) return;
    if (inRoom && !isHost) {
      sendCommand(snap.status === "playing" ? { action: "pause" } : { action: "play" });
      return;
    }
    const b = bridgeRef.current;
    if (!b) return;
    expectedRoomPlayingRef.current = null;
    if (snap.status === "playing") b.pause();
    else b.play().catch(() => {});
  };
  const seekStep = (delta: number) => {
    if (castDevice) {
      void seekCast(Math.max(0, snap.positionSec + delta));
      return;
    }
    if (!canControl) return;
    if (inRoom && !isHost) {
      sendCommand({ action: "seek", positionSeconds: Math.max(0, snap.positionSec + delta) });
      return;
    }
    bridgeRef.current?.seek(snap.positionSec + delta);
  };

  useStubDetection({ src, snap, closePlayer });

  useAutoEndExit({
    src,
    snap,
    nextEp: adjacent.next,
    canChangeEpisode,
    roomGuest,
    closePlayer,
  });

  const atEndOfStream =
    snap.status === "ended" ||
    (snap.durationSec > 0 && snap.positionSec >= snap.durationSec - 2);
  const isLocalSrc = isLocalUrl(src.url);
  const [pillSuppressed, setPillSuppressed] = useState(true);
  useEffect(() => {
    setPillSuppressed(true);
    const t = window.setTimeout(() => setPillSuppressed(false), 2500);
    return () => window.clearTimeout(t);
  }, [src.url]);
  const streamPillVariant: "check" | "stalled" | "failed" | null =
    pipMode || showWaiting || atEndOfStream || isLocalSrc
      ? null
      : snap.errorCode != null && snap.status === "error" && !pillSuppressed
        ? "failed"
        : slowLoad && !inRoom
          ? "stalled"
          : streamCheckOpen
            ? "check"
            : null;

  const skipSegments = useSkipSegments(src.meta, src.episode, snap.chapters, snap.durationSec);
  const realActiveSkip = activeSegment(skipSegments, snap.positionSec);
  const hasNextEpisodeNow = canChangeEpisode && !!adjacent.next;
  const syntheticOutro = useMemo(() => {
    if (realActiveSkip) return null;
    if (!hasNextEpisodeNow) return null;
    if (snap.durationSec <= 0) return null;
    const remaining = snap.durationSec - snap.positionSec;
    if (remaining > 90 || remaining < 0.5) return null;
    const hasRealOutro = skipSegments.some((s) => s.kind === "outro");
    if (hasRealOutro) return null;
    return {
      kind: "outro" as const,
      startSec: Math.max(0, snap.durationSec - 90),
      endSec: snap.durationSec,
      source: "chapters" as const,
    };
  }, [
    realActiveSkip,
    hasNextEpisodeNow,
    snap.durationSec,
    snap.positionSec,
    skipSegments,
  ]);
  const activeSkip = realActiveSkip ?? syntheticOutro;
  const skipSegmentEnd = activeSkip?.endSec;
  const onSkipSegment = useCallback(() => {
    if (skipSegmentEnd == null) return;
    if (castDevice) {
      void seekCast(skipSegmentEnd);
      return;
    }
    if (!canControl) return;
    if (inRoom && !isHost) {
      sendCommand({ action: "seek", positionSeconds: skipSegmentEnd });
      return;
    }
    bridgeRef.current?.seek(skipSegmentEnd);
  }, [skipSegmentEnd, castDevice, canControl, inRoom, isHost, sendCommand, seekCast]);

  const overlayCovers = switcherOpen || showWaiting || foreignNotice != null;
  useMpvEmbed({
    engine,
    settings,
    pipMode,
    chromeVisible,
    streamPillVariant,
    snap,
    overlayCovers,
    anyMenuOpen,
  });

  const mpvEmbedWindowsActive =
    engine === "mpv" &&
    settings.playerMpvEmbed &&
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("windows");
  const mpvEmbedMacActive = engine === "mpv" && settings.playerMpvEmbed && isMacDesktop();
  const macEmbedShowingVideo =
    mpvEmbedMacActive && snap.videoWidth > 0 && snap.videoHeight > 0;
  const stageBg = mpvEmbedWindowsActive || macEmbedShowingVideo ? "" : "bg-black";
  const { loaderActive } = useEverPlayed({
    url: src.url,
    status: snap.status,
    durationSec: snap.durationSec,
    positionSec: snap.positionSec,
    swappingEp,
    swapResolvingKey,
  });
  const showChrome = !loaderActive && (chromeVisible || drawMode);
  const ActiveShell = getPlayerShell(settings.playerShellId).Component;
  const liveShellSnap = castDevice
    ? { ...snap, positionSec: castPositionSec || snap.positionSec, status: (castPlaying ? "playing" : "paused") as typeof snap.status }
    : snap;
  if (showChrome) shellSnapRef.current = liveShellSnap;
  const shellSnap = showChrome ? liveShellSnap : shellSnapRef.current;
  return (
    <main
      ref={stageRef}
      data-harbor-player
      className={`fixed inset-0 z-[100] overflow-hidden ${stageBg}`}
      style={cursorStyle}
      onMouseMove={wakeChrome}
      onMouseEnter={wakeChrome}
    >
      <div
        ref={videoMountRef}
        className="absolute inset-0"
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          if (drawMode || pipMode) return;
          playPauseToggle();
        }}
      />
      {(!pipMode || settings.subShowInPip) && (
        <SubtitleOverlay text={snap.subText} startSec={snap.subStartSec} scale={pipMode ? 0.45 : 1} />
      )}
      {showStats && !pipMode && <StatsOverlay snap={snap} engine={engine} />}
      <CastMenu
        open={castMenuOpen}
        anchor={castMenuAnchor}
        onClose={closeCastMenu}
        onPick={async (device) => {
          if (device.audio_only) {
            setCastIncompatError(
              `${device.name} is an audio-only device. Harbor can't transcode video to audio yet, so this device can only stream audio files. Pick a TV, Chromecast, or display-equipped device to stream video.`,
            );
            closeCastMenu();
            return;
          }
          const resolved = await resolveCompatibleCastUrl(src, device, debrids, {
            width: snap.videoWidth,
            height: snap.videoHeight,
          });
          if (resolved.kind === "incompatible") {
            const hint =
              resolved.candidatesChecked === 0
                ? `${resolved.caps.label} can't play this stream (${resolved.reasons.join(", ")}). Click "Pick another" first to load alternatives, then try casting again.`
                : `${resolved.caps.label} can't play this stream (${resolved.reasons.join(", ")}) and none of the ${resolved.candidatesChecked} available alternatives match its capabilities.`;
            setCastIncompatError(hint);
            closeCastMenu();
            return;
          }
          if (resolved.kind === "needs-ffmpeg") {
            const installCmd = navigator.userAgent.includes("Mac")
              ? "brew install ffmpeg"
              : navigator.userAgent.includes("Linux")
                ? "sudo apt install ffmpeg"
                : "winget install Gyan.FFmpeg";
            setCastErrorInfo({
              title: "Install ffmpeg",
              message: `${resolved.caps.label} can't decode this stream natively (${resolved.reasons.join(", ")}). Harbor uses ffmpeg to convert it into a format your TV understands.`,
              steps: [
                `Open a terminal and run: ${installCmd}`,
                "Restart Harbor after the install completes.",
                "Open the cast menu and try this device again.",
              ],
              deviceName: device.name,
            });
            closeCastMenu();
            return;
          }
          if (resolved.kind === "swapped") {
            console.info(
              `[cast] swapped stream for ${resolved.caps.label}: ${resolved.reasons.join(", ")} -> ${resolved.alt.parsedTitle ?? resolved.alt.title ?? "alt"}`,
            );
          }
          if (resolved.kind === "transcode") {
            console.info(
              `[cast] transcoding for ${resolved.caps.label}: ${resolved.reasons.join(", ")}`,
            );
          }
          const isLiveIptv = src.meta.id?.startsWith("iptv:") ?? false;
          const forceTranscode = resolved.kind === "transcode" || isLiveIptv;
          const UNIVERSAL_SAFE_PROFILE = {
            max_height: 1080 as const,
            force_h264: true,
            force_aac: true,
            force_stereo: true,
            max_video_kbps: 5000,
          };
          const profile = forceTranscode ? UNIVERSAL_SAFE_PROFILE : undefined;
          setCastTranscoding(forceTranscode);
          await pickCastDevice(
            device,
            {
              url: resolved.url,
              title: src.title,
              poster: src.meta.poster ?? undefined,
              contentType: forceTranscode ? "application/x-mpegURL" : guessContentType(resolved.url),
              startTimeSec: isLiveIptv ? 0 : snap.positionSec,
              headers: isLiveIptv
                ? { "user-agent": "VLC/3.0.20 LibVLC/3.0.20" }
                : undefined,
              transcode: forceTranscode,
              profile,
            },
            () => bridgeRef.current?.pause(),
          );
        }}
      />
      {pendingCastDevice && !castDevice && (
        <CastingOverlay
          device={pendingCastDevice}
          title={src.title}
          poster={src.meta.poster}
          playing={false}
          connecting
        />
      )}
      {castDevice && (
        <>
          <CastingOverlay
            device={castDevice}
            title={src.title}
            poster={src.meta.poster}
            playing={castPlaying}
          />
          <CastSessionBar
            device={castDevice}
            playing={castPlaying}
            positionSec={castPositionSec || snap.positionSec}
            durationSec={snap.durationSec}
            onTogglePlay={togglePlayCast}
            onStop={() => {
              setCastTranscoding(false);
              return stopCast();
            }}
            onSeek={seekCast}
            transcoding={castTranscoding}
          />
        </>
      )}
      {castError && (
        <div className="pointer-events-none absolute right-6 top-20 z-20 rounded-xl border border-rose-300/40 bg-rose-400/15 px-4 py-2 text-[12.5px] text-rose-100">
          {castError}
        </div>
      )}
      <CastErrorModal error={castErrorInfo} onDismiss={dismissCastErrorInfo} />
      {castIncompatError && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-30 flex max-w-[520px] -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-[12.5px] leading-relaxed text-amber-50 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <span className="flex-1">{castIncompatError}</span>
          <button
            type="button"
            onClick={() => {
              setCastIncompatError(null);
              pickAnother();
            }}
            className="shrink-0 rounded-full bg-amber-300/30 px-3 py-1 text-[11.5px] font-semibold text-amber-50 hover:bg-amber-300/50"
          >
            Pick another
          </button>
          <button
            type="button"
            onClick={() => setCastIncompatError(null)}
            className="shrink-0 rounded-full px-2 py-1 text-[11.5px] font-medium text-amber-50/80 hover:text-amber-50"
          >
            Dismiss
          </button>
        </div>
      )}
      <DragClickStage
        drawMode={drawMode}
        pipMode={pipMode}
        onClick={playPauseToggle}
        onDoubleClick={toggleFullscreen}
      />

      {isLocalSrc && snap.errorCode != null ? null : (
        <CinematicPlayerLoader
          src={src}
          snap={snap}
          forceShow={swappingEp || swapResolvingKey != null}
          onCancel={closePlayer}
        />
      )}

      {isLocalSrc && snap.errorCode != null && (
        <LocalFileError
          path={src.url}
          errorMessage={snap.errorMessage}
          onBack={closePlayer}
          onRetry={() => {
            const b = bridgeRef.current;
            if (b) {
              void b.load({ url: src.url, subtitles: src.subtitles, notWebReady: src.notWebReady });
            }
          }}
        />
      )}

      {!pipMode && !castDevice && (
        <StrokesLayer strokes={strokes} hideOthers={hideOthersDrawings} selfId={clientId} />
      )}
      {drawMode && !pipMode && !castDevice && bridgeRef.current && (
        <DrawCanvas
          enabled={drawMode}
          selfId={clientId}
          selfName={selfName}
          selfColor={selfColor}
          hideOthers={hideOthersDrawings}
          strokes={strokes}
          onStrokeStart={onDrawStart}
          onStrokePoint={onDrawPoint}
          onStrokeEnd={onDrawEnd}
        />
      )}

      {!pipMode && !drawMode && !showWaiting && pendingResumeSec == null && pendingSeekSec == null && (
        <SkipPill
          segment={activeSkip}
          hasNextEp={canChangeEpisode && !autoNextCancelled && !!adjacent.next}
          nextEp={canChangeEpisode && !autoNextCancelled ? adjacent.next : null}
          remainingSec={Math.max(0, snap.durationSec - snap.positionSec)}
          visible={hasStarted || !inRoom}
          onSkip={onSkipSegment}
          onNextEpisode={() => goToEpisode(adjacent.next)}
          onCancelAutoNext={() => setAutoNextCancelled(true)}
        />
      )}

      {!pipMode && !drawMode && (
        <QuickTools
          visible={showChrome}
          ab={ab}
          toast={frameGrab.toast}
        />
      )}

      <ActiveShell
        snap={shellSnap}
        engine={engine}
        useOverlayPopups={false}
        onMenuOpenChange={setAnyMenuOpen}
        capabilities={bridgeRef.current?.capabilities() ?? { engine: "html5", pictureInPicture: false, airplay: false, chromecast: false, hdrPassthrough: false, hardwareDecode: true }}
        visible={showChrome}
        fullscreen={fullscreen}
        drawMode={drawMode}
        hideOthersDrawings={hideOthersDrawings}
        pipMode={pipMode}
        showDraw={inRoom && roomSnapshot.participants.length > 1 && !castDevice}
        onBack={closePlayer}
        onPlayPause={playPauseToggle}
        onSeek={(s) => {
          if (castDevice) {
            void seekCast(Math.max(0, s));
            return;
          }
          if (!canControl) return;
          if (inRoom && !isHost) {
            sendCommand({ action: "seek", positionSeconds: Math.max(0, s) });
            return;
          }
          bridgeRef.current?.seek(s);
        }}
        onSeekStep={seekStep}
        onMute={() => {
          const next = !snap.muted;
          bridgeRef.current?.setMuted(next);
          writePlayerVolume({ muted: next });
        }}
        onVolume={(v) => {
          bridgeRef.current?.setVolume(v);
          writePlayerVolume({ volume: v });
        }}
        onAudio={(id) => {
          bridgeRef.current?.setAudioTrack(id);
          const t = snap.audioTracks.find((x) => x.id === id);
          if (t?.lang) writePlayerPrefs(src.meta.id, { audioLang: t.lang });
        }}
        onSubtitle={(id) => {
          bridgeRef.current?.setSubtitleTrack(id);
          const t = snap.subtitleTracks.find((x) => x.id === id);
          if (t?.lang) writePlayerPrefs(src.meta.id, { subLang: t.lang });
        }}
        onSubDelay={(s) => {
          bridgeRef.current?.setSubDelay(s);
          writePlayerPrefs(src.meta.id, { subDelaySec: s });
        }}
        onAudioDelay={(s) => bridgeRef.current?.setAudioDelay(s)}
        onAddSubtitle={(url, lang, title) => {
          void bridgeRef.current?.addSubtitle(url, lang, title);
        }}
        onRate={(r) => {
          bridgeRef.current?.setRate(r);
          writePlayerPrefs(src.meta.id, { rate: r });
        }}
        onPiP={() => togglePipMode()}
        onFullscreen={toggleFullscreen}
        onCast={() => {
          const btn = (document.querySelector(
            '[aria-label="Cast"]',
          ) as HTMLElement | null);
          if (btn) {
            const r = btn.getBoundingClientRect();
            openCastMenu({ right: r.right, bottom: r.top });
          } else {
            openCastMenu(null);
          }
        }}
        onToggleDraw={() => {
          setDrawMode((d) => !d);
          wakeChrome();
        }}
        onToggleHideOthers={() => setHideOthersDrawings((h) => !h)}
        onPickAnother={pickAnotherOrGuide}
        canPickAnother={!inRoom || isHost}
        title={src.title}
        subtitle={src.subtitle}
        hoverTitle={src.meta.name}
        hoverSub={
          src.episode
            ? `S${src.episode.season} · E${String(src.episode.episode).padStart(2, "0")}`
            : undefined
        }
        hasPrevEp={canChangeEpisode && !!adjacent.prev}
        hasNextEp={canChangeEpisode && !!adjacent.next}
        onPrevEp={() => goToEpisode(adjacent.prev)}
        onNextEp={() => goToEpisode(adjacent.next)}
        metaImdbId={resolvedImdbId}
        metaTitle={src.meta.name ?? null}
        metaReleaseDate={src.meta.releaseDate ?? null}
        meta={src.meta}
        tmdbKey={settings.tmdbKey ?? null}
        season={src.episode?.season ?? null}
        episode={src.episode?.episode ?? null}
        download={download.status}
        onDownloadStart={download.start}
        onDownloadCancel={download.cancel}
        onDownloadReveal={download.reveal}
        onDownloadReset={download.reset}
        onOpenDvr={liveOverlay.isLive ? () => setDvrOpen(true) : undefined}
        sleep={sleep}
      />

      {inRoom && !pipMode && (
        <AvatarDock
          participants={roomSnapshot.participants}
          selfId={clientId}
          hostId={roomSnapshot.hostClientId}
          syncState={roomSnapshot.syncState}
          visible={chromeVisible || !playing}
          presenceMap={presenceMap}
          participantLocations={participantLocations}
          now={now}
          corner={avatarsCorner}
          hidden={avatarsHidden}
        />
      )}

      {inRoom && !pipMode && (
        <ChatOverlay
          messages={chat}
          onSend={sendChat}
          selfId={clientId}
          participants={roomSnapshot.participants}
          forceVisible={chromeVisible}
          corner={chatCorner}
          hidden={chatHidden}
        />
      )}

      {showWaiting && (
        <WaitingForRoom
          isHost={isHost}
          notReady={notReady}
          participants={roomSnapshot.participants}
          clientId={clientId}
          onStartAnyway={() => {
            setHasStarted(true);
            suppressOutgoingFor(0);
            bridgeRef.current?.play().catch(() => {});
          }}
          onLeave={closePlayer}
        />
      )}

      {streamPillVariant && !switcherOpen && (
        <StreamCheckPill
          variant={streamPillVariant}
          visible
          compact={mpvEmbedWindowsActive}
          onLooksGood={
            streamPillVariant === "check" ? () => setStreamCheckOpen(false) : undefined
          }
          onPickAnother={pickAnotherOrGuide}
        />
      )}

      {liveOverlay.open && liveOverlay.activeSource && (
        <LiveChannelOverlay
          source={liveOverlay.activeSource}
          sources={liveOverlay.availableSources}
          onSelectSource={liveOverlay.selectSource}
          currentChannelId={liveOverlay.currentChannelId}
          onSwitch={liveOverlay.switchChannel}
          onClose={() => liveOverlay.setOpen(false)}
          group={liveOverlay.group}
          setGroup={liveOverlay.setGroup}
          query={liveOverlay.query}
          setQuery={liveOverlay.setQuery}
        />
      )}
      {liveOverlay.isLive && liveOverlay.activeSource && liveOverlay.currentChannelId && (
        <LiveChannelDvr
          open={dvrOpen}
          onClose={() => setDvrOpen(false)}
          source={liveOverlay.activeSource}
          channelId={liveOverlay.currentChannelId}
          url={src.url}
          channelName={src.meta.name ?? src.title}
        />
      )}
      <StreamSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onPick={onSwitchStream}
        resolvingKey={swapResolvingKey}
        currentUrl={liveUrl}
        debridSlugs={debrids.map((d) => d.slug)}
        meta={src.meta}
        episode={src.episode}
      />

      {isSeriesPlayback && chromeVisible && !episodePanelOpen && !switcherOpen && !pipMode && !drawMode && !episodesHidden && !roomGuest && (
        <button
          onClick={() => setEpisodePanelOpen(true)}
          aria-label="Up next"
          className={`group absolute top-1/2 z-20 flex h-32 -translate-y-1/2 flex-col items-center justify-center gap-2.5 bg-elevated/95 text-ink ring-1 ring-edge-soft shadow-[0_10px_32px_-10px_rgba(0,0,0,0.6)] backdrop-blur-md transition-[padding,background] duration-200 hover:bg-elevated ${
            episodesCorner === "top-left" || episodesCorner === "bottom-left"
              ? "left-0 rounded-r-2xl pl-2 pr-2.5 hover:pr-3"
              : "right-0 rounded-l-2xl pl-2.5 pr-2 hover:pl-3"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 6h13M3 12h13M3 18h9M18 8l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Up Next
          </span>
        </button>
      )}

      {isSeriesPlayback && (
        <EpisodePanel
          open={episodePanelOpen && !episodesHidden}
          onClose={() => setEpisodePanelOpen(false)}
          meta={src.meta}
          currentEpisode={src.episode}
          corner={episodesCorner}
          roomGuest={roomGuest}
          onHostAdvance={broadcastEpisode}
        />
      )}

      {pendingResumeSec != null && (
        <ResumePrompt
          resumeSec={pendingResumeSec}
          totalSec={snap.durationSec}
          title={src.meta.name ?? src.title}
          onResume={() => acknowledgeResume("resume")}
          onStartOver={() => acknowledgeResume("start-over")}
        />
      )}

      {showHeaderWarning && !streamPillVariant && <HeaderWarning onPickAnother={pickAnotherOrGuide} />}

      {foreignNotice && (
        <ForeignNoticeBox
          title={foreignNotice.title}
          onDismiss={() => setForeignNotice(null)}
        />
      )}
    </main>
  );
}
