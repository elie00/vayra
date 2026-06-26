import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveChromeTheme } from "@/lib/theme";
import { type PlayerBridge } from "@/lib/player/bridge";
import { useDebridClients } from "@/lib/debrid/registry";
import { useSettings } from "@/lib/settings";
import { writePlayerVolume } from "@/lib/player-volume";
import { nameColor } from "@/lib/together/colors";
import { useTogether } from "@/lib/together/provider";
import { buildPlayInvite } from "@/lib/together/build-invite";
import { useView, type PlayerSrc, type PlayEpisode } from "@/lib/view";
import { useSkipSegments, useAdSegments } from "@/lib/skip-intro";
import { withinAdWindow } from "@/lib/ad-report/window";
import { isLocalUrl } from "@/lib/player/local-url";
import { useAuth } from "@/lib/auth";
import { embedFlags } from "./player/player-utils";
import { useFullscreen } from "./player/hooks/use-fullscreen";
import { usePlayerCast } from "./player/hooks/use-player-cast";
import { useCastReturnPublish } from "./player/hooks/use-cast-return-publish";
import { useChromeConfig } from "./player/hooks/use-chrome-config";
import { useEverPlayed } from "./player/hooks/use-ever-played";
import { useDrawMode } from "./player/hooks/use-draw-mode";
import { useChromeVisibility } from "./player/hooks/use-chrome-visibility";
import { useAutoRetry } from "./player/hooks/use-auto-retry";
import { useWakeReconnect } from "./player/hooks/use-wake-reconnect";
import { useEngineStats } from "./player/hooks/use-engine-stats";
import { isBundledEngineUrl, isLocalEngineUrl } from "@/lib/stremio-server";
import { usePauseOnInactive } from "./player/hooks/use-pause-on-inactive";
import { spoilerMaskFor } from "@/lib/spoilers";
import { usePlayerWatched } from "./player/hooks/use-player-watched";
import { useRoomSync } from "./player/hooks/use-room-sync";
import { useHostSource } from "./player/hooks/use-host-source";
import { useLobbyGate } from "./player/hooks/use-lobby-gate";
import { hostSourceMatchesMedia } from "@/lib/together/room-derive";
import { useLiveChannelOverlay } from "./player/hooks/use-live-channel-overlay";
import { useStreamSwitcher } from "./player/hooks/use-stream-switcher";
import { useMpvEmbed } from "./player/hooks/use-mpv-embed";
import { usePlayerBridge } from "./player/hooks/use-player-bridge";
import { useTextSync } from "./player/hooks/use-text-sync";
import { useT } from "@/lib/i18n";
import { useEpisodeNavigation } from "./player/hooks/use-episode-navigation";
import { useAbLoop } from "./player/hooks/use-ab-loop";
import { useAutoNextEpisode } from "./player/hooks/use-auto-next-episode";
import { useFrameGrab } from "./player/hooks/use-frame-grab";
import { useClipRecorder } from "./player/hooks/use-clip-recorder";
import { useGifRecorder } from "./player/hooks/use-gif-recorder";
import { useSleepTimer } from "./player/hooks/use-sleep-timer";
import { useAutoEndExit } from "./player/hooks/use-auto-end-exit";
import { usePipMode } from "./player/hooks/use-pip-mode";
import { usePlaybackControls } from "./player/hooks/use-playback-controls";
import { usePlaybackPresence } from "./player/hooks/use-playback-presence";
import { usePlayerExit } from "./player/hooks/use-player-exit";
import { usePendingSeekApply } from "./player/hooks/use-pending-seek-apply";
import { usePlayerHotkeys } from "./player/hooks/use-player-hotkeys";
import { usePlayerMedia } from "./player/hooks/use-player-media";
import { useTrickplay } from "./player/hooks/use-trickplay";
import { useStreamPill } from "./player/hooks/use-stream-pill";
import { useStubDetection } from "./player/hooks/use-stub-detection";
import { useBridgeLoad } from "./player/hooks/use-bridge-load";
import { useVideoFill } from "./player/hooks/use-video-fill";
import { useAnime4k } from "./player/hooks/use-anime4k";
import { useHdrStage } from "./player/hooks/use-hdr-stage";
import { useSdrBoostGate } from "./player/hooks/use-sdr-boost-gate";
import { PlayerOverlayLayers, type PlayerOverlayLayersProps } from "./player/player-overlay-layers";
import { HdrStageBridge } from "./player/hdr-stage-bridge";
import { setSkipSegmentsView } from "@/lib/skip-intro/segment-store";
import type { ToastInfo } from "@/views/addons/addons-types";

export function PlayerView({ src }: { src: PlayerSrc }) {
  const { setChromeHidden, topPath, openPicker, exitPlayback, replacePlayerSrc } = useView();
  const { settings, update } = useSettings();
  const t = useT();
  const chromeTheme = resolveChromeTheme(settings.theme, settings.playerChromeTheme);
  const {
    avatarsCorner,
    chatCorner,
    episodesCorner,
    avatarsHidden,
    chatHidden,
    episodesHidden,
  } = useChromeConfig(chromeTheme);
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
    hostSource,
  } = useTogether();
  const stageRef = useRef<HTMLDivElement>(null);
  const videoMountRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<PlayerBridge | null>(null);
  const selfFrameReadyRef = useRef(false);
  const { fullscreen, toggleFullscreen } = useFullscreen();
  const { snap, engine, bridgeReady, bridgeKey, embedActive } = usePlayerBridge({
    bridgeRef,
    videoMountRef,
    src,
    settings,
  });
  const isP2pEngine =
    (isBundledEngineUrl(src.url) || isLocalEngineUrl(src.url)) &&
    !src.url.includes("/hlsv2/") &&
    !!src.streamRef?.infoHash;
  const { stats: engineStats, genuineFailure } = useEngineStats({
    url: src.url,
    infoHash: src.streamRef?.infoHash ?? null,
    fileIdx: src.streamRef?.fileIdx ?? null,
    active: snap.status !== "ended" && (snap.videoWidth <= 0 || isP2pEngine),
  });
  const shellSnapRef = useRef(snap);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const [foreignNotice, setForeignNotice] = useState<{ title: string | null; from: string } | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const cast = usePlayerCast({ src, debrids, snapRef, bridgeRef, settings });
  const [now, setNow] = useState(() => Date.now());
  const { pipMode, togglePipMode, exitPip } = usePipMode({ bridgeRef, setChromeHidden });
  const { slowLoad, transcodedUrl } = useAutoRetry({
    bridgeRef,
    src,
    snap,
    stremioServerTranscode: settings.stremioServerTranscode,
    instantPlay: settings.instantPlay,
    inRoom: roomSnapshot.state === "joined",
    debrids,
    selfFrameReadyRef,
    openPicker,
    engineFailure: genuineFailure,
    isP2pEngine,
    engineStats,
  });

  useWakeReconnect({ bridgeRef, src, snap });

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
  const guestPickRef = useRef(settings.togetherGuestsPick);
  guestPickRef.current = settings.togetherGuestsPick;

  usePauseOnInactive({ bridgeRef, snapRef });

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

  const { chromeVisible, wakeChrome, hideForResume, setAnyMenuOpen, cursorStyle } = useChromeVisibility({
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
    nextEp: settings.autoPlayNextEpisode ? adjacent.next : null,
    canChangeEpisode,
    cancelled: autoNextCancelled,
    goToEpisode,
  });

  const quickToolsEnabled = !inRoom || isHost;
  const ab = useAbLoop({
    bridgeRef,
    durationSec: snap.durationSec,
    enabled: quickToolsEnabled,
    resetKey: src.url,
  });
  const sleep = useSleepTimer({
    bridgeRef,
    status: snap.status,
    durationSec: snap.durationSec,
    srcUrl: src.url,
  });
  const frameGrab = useFrameGrab({
    bridgeRef,
    src,
  });
  const gif = useGifRecorder({ src });
  const clip = useClipRecorder({ src });

  const { resolvedImdbId, subAssNative, captureExitSnapshot, download, subDropToast } = usePlayerMedia({
    src,
    snap,
    engine,
    settings,
    authKey,
    bridgeRef,
    bridgeReady,
    bridgeKey,
    videoMountRef,
    toggleFullscreen,
    castActiveRef: cast.castActiveRef,
    season,
    episode,
  });

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
  });
  const { hostSourceRef } = useHostSource({
    inRoom,
    isHost,
    hasStarted,
    src,
    liveUrl,
    liveStreamRef,
    snap,
    guestPickRef,
    publishState,
  });
  const guestHostSource =
    inRoom && !isHost && hostSourceMatchesMedia(hostSource, src.meta.id, src.episode ?? null)
      ? hostSource!.descriptor
      : null;
  const liveOverlay = useLiveChannelOverlay({
    src,
    replacePlayerSrc,
  });

  usePlaybackPresence({ src, snap, season, episode, liveGuideOpen: liveOverlay.open });
  useCastReturnPublish({
    casting: !!cast.castDevice,
    inRoom,
    isHost,
    src,
    snapRef,
    hostSourceRef,
    guestPickRef,
    publishState,
  });

  const { closePlayer, onStubEject } = usePlayerExit({
    src,
    season,
    episode,
    bridgeRef,
    liveUrl,
    liveStreamRef,
    inRoom,
    isHost,
    instantPlay: settings.instantPlay,
    captureExitSnapshot,
    exitPip,
    castActiveRef: cast.castActiveRef,
    stopCast: cast.stopCast,
    publishState,
    notifyHostLeaving,
    clearInvite,
    exitPlayback,
    openPicker,
  });

  const [dvrOpen, setDvrOpen] = useState(false);
  const pickAnotherOrGuide = useCallback(() => {
    if (liveOverlay.isLive) {
      liveOverlay.setOpen(true);
    } else {
      pickAnother();
    }
  }, [liveOverlay, pickAnother]);

  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const { watchedFor } = usePlayerWatched({
    meta: src.meta,
    authKey,
    imdbId: resolvedImdbId,
    enabled: !!src.episode && (episodePanelOpen || !!adjacent.next),
  });
  const nextEpMask = spoilerMaskFor(settings, {
    watched: adjacent.next ? watchedFor(adjacent.next) : true,
    isNextUp: true,
  });
  const isSeriesPlayback = !!src.episode && src.meta.type === "series";

  const showHeaderWarning =
    src.notWebReady === true && engine === "html5" && (snap.status === "error" || snap.status === "loading");
  const [noAudioDismissed, setNoAudioDismissed] = useState(false);
  useEffect(() => {
    setNoAudioDismissed(false);
  }, [src.url]);
  const showNoAudioWarning =
    engine === "html5" &&
    snap.noAudio === true &&
    !noAudioDismissed &&
    !liveOverlay.isLive &&
    settings.playerEngine !== "auto";

  const { inRoomRef, isHostRef, initialSyncDoneRef } = useRoomSync({
    inRoom,
    isHost,
    hasStarted,
    setHasStarted,
    selfFrameReadyRef,
    roomSnapshot,
    clientId,
    src,
    snap,
    bridgeRef,
    hostSourceRef,
    guestPickRef,
    publishState,
    onIncomingState,
    onIncomingCommand,
    markReady,
    suppressOutgoingFor,
    setForeignNotice,
    cast: cast.sync,
  });

  const lobby = useLobbyGate({
    inRoom,
    isHost,
    hasStarted,
    setHasStarted,
    roomSnapshot,
    startRoom,
    suppressOutgoingFor,
    bridgeRef,
    initialSyncDoneRef,
    mediaKey: `${src.meta.id}|${src.episode?.season ?? ""}|${src.episode?.episode ?? ""}`,
  });

  const { rememberSubChoice, cycleSubtitles, playPauseToggle, seekStep, seekTo } = usePlaybackControls({
    bridgeRef,
    snapRef,
    metaId: src.meta.id,
    inRoom,
    isHost,
    hasStarted,
    canControl,
    castDevice: cast.castDevice,
    startHost: lobby.startHost,
    togglePlayCast: cast.togglePlayCast,
    seekCast: cast.seekCast,
    sendCommand,
  });

  const textSync = useTextSync(bridgeRef.current, src.meta.id);
  const [syncToast, setSyncToast] = useState<ToastInfo | null>(null);
  const syncToastTimerRef = useRef<number | null>(null);
  const showSyncToast = useCallback((kind: "ok" | "error", text: string) => {
    if (syncToastTimerRef.current != null) window.clearTimeout(syncToastTimerRef.current);
    setSyncToast({ kind, text });
    syncToastTimerRef.current = window.setTimeout(() => setSyncToast(null), kind === "error" ? 5000 : 3000);
  }, []);
  const handleEnterSync = useCallback(async () => {
    const res = await textSync.enterSync();
    if (!res.ok) {
      const reason = res.reason === "no-cues"
        ? t("No subtitle cues available")
        : res.reason === "local-path-unreadable"
          ? t("Could not read the subtitle file")
          : res.reason === "no-bridge"
            ? t("Player not ready")
            : t("Sync unavailable");
      showSyncToast("error", reason);
    }
  }, [textSync.enterSync, showSyncToast, t]);

  const videoFill = useVideoFill(bridgeRef, src.url);
  const anime4k = useAnime4k(bridgeRef, src.url, src);
  const { holdSpeedActive, showStats } = usePlayerHotkeys({
    bridgeRef,
    snap,
    metaId: src.meta.id,
    drawMode,
    setDrawMode,
    closePlayer,
    playPauseToggle,
    seekStep,
    seekTo,
    toggleFullscreen,
    togglePip: togglePipMode,
    fullscreen,
    cycleSubtitles,
    canChangeEpisode,
    adjacent,
    goToEpisode,
    toggleSwitcher: () => setSwitcherOpen((v) => !v),
    toggleEpisodePanel: () => setEpisodePanelOpen((v) => !v),
    liveOverlay,
    toggleDvr: () => setDvrOpen((v) => !v),
    sleep,
    quickToolsEnabled,
    frameGrab,
    onToggleAnime4k: () => {
      if (!anime4k.available) {
        showSyncToast("error", t("Anime4K isn't set up yet. Turn it on in Settings under Anime."));
        return;
      }
      anime4k.setMode(anime4k.mode === "off" ? "auto" : "off");
    },
    onAnime4kOn: () => {
      if (!anime4k.available) {
        showSyncToast("error", t("Anime4K isn't set up yet. Turn it on in Settings under Anime."));
        return;
      }
      anime4k.setMode("auto");
    },
    onAnime4kOff: () => {
      anime4k.setMode("off");
    },
    gif,
    clip,
    videoFill,
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

  usePendingSeekApply({
    pendingSeekSec,
    clearPendingSeek,
    durationSec: snap.durationSec,
    bridgeRef,
    inRoomRef,
  });

  useStubDetection({ src, snap, onStub: onStubEject });

  const isLiveLike =
    liveOverlay.isLive ||
    !!src.meta.id?.startsWith("iptv:") ||
    (!!src.meta.type && !["movie", "series", "anime"].includes(String(src.meta.type).toLowerCase()));
  const reloadLive = useCallback(() => {
    bridgeRef.current?.load({
      url: src.url,
      subtitles: src.subtitles,
      notWebReady: src.notWebReady,
      isLive: true,
      headers: src.headers,
    });
  }, [src.url, src.subtitles, src.notWebReady, src.headers]);

  useAutoEndExit({
    src,
    snap,
    nextEp: adjacent.next,
    canChangeEpisode,
    roomGuest,
    isLive: isLiveLike,
    reloadLive,
    closePlayer,
  });

  const isLocalSrc = isLocalUrl(src.url);
  const streamPillVariant = useStreamPill({
    srcUrl: src.url,
    snap,
    pipMode,
    showWaiting,
    isLocalSrc,
    slowLoad,
    inRoom,
    streamCheckOpen,
  });

  const playStreamRef = liveStreamRef ?? src.streamRef;
  const playUrl = liveUrl ?? src.url;
  useTrickplay({ url: playUrl, enabled: settings.seekPreviewEnabled });
  const adSegments = useAdSegments(
    src.meta.id,
    src.imdbId ?? null,
    playStreamRef,
    playUrl,
    withinAdWindow(src.meta) || settings.adSkipEnabled,
  );
  const skipSegments = useSkipSegments(
    src.meta,
    src.episode,
    snap.chapters,
    snap.durationSec,
    adSegments,
  );
  useEffect(() => {
    setSkipSegmentsView(skipSegments);
    return () => setSkipSegmentsView([]);
  }, [skipSegments]);
  const hasNextEpisodeNow = canChangeEpisode && !!adjacent.next;

  useMpvEmbed({ engine, settings });

  useSdrBoostGate({
    engine,
    hdrGamma: snap.hdrGamma,
    enabled: settings.mpvTweaks?.["inverse-tone-mapping"] === "yes",
  });

  const { requested: hdrStageRequested, confirmed: hdrStageActive } = useHdrStage({
    engine,
    embedActive,
    hdrGamma: snap.hdrGamma,
    playerHdrStage: settings.playerHdrStage,
    playerHdrToSdr: settings.playerHdrToSdr,
    onFallback: () =>
      showSyncToast(
        "error",
        t(
          "HDR controls could not load. Showing the video with controls. For reliable HDR, switch to True HDR, separate window in Settings.",
        ),
      ),
  });

  const { mpvEmbedWindowsActive, stageBg } = embedFlags(
    engine,
    embedActive,
    snap.videoWidth,
    snap.videoHeight,
  );
  const { loaderActive } = useEverPlayed({
    url: src.url,
    status: snap.status,
    durationSec: snap.durationSec,
    swappingEp,
    swapResolvingKey,
  });
  const [loaderShowing, setLoaderShowing] = useState(false);
  const showChrome = !loaderActive && !loaderShowing && (chromeVisible || drawMode);
  const liveShellSnap = cast.castDevice
    ? { ...snap, status: (cast.castPlaying ? "playing" : "paused") as typeof snap.status }
    : snap;
  if (showChrome) shellSnapRef.current = liveShellSnap;
  const shellSnap = showChrome ? liveShellSnap : shellSnapRef.current;
  const volumeRef = useRef(snap.volume);
  useEffect(() => {
    volumeRef.current = snap.volume;
  }, [snap.volume]);
  const onVolumeWheel = useCallback((deltaY: number) => {
    const dir = deltaY < 0 ? 1 : -1;
    const next = Math.min(6, Math.max(0, volumeRef.current + dir * 0.05));
    volumeRef.current = next;
    bridgeRef.current?.setVolume(next);
    writePlayerVolume({ volume: next });
  }, []);

  const overlayProps: PlayerOverlayLayersProps = {
    snap,
    engine,
    src,
    adStreamRef: playStreamRef,
    adUrl: playUrl,
    subShowInPip: settings.subShowInPip,
    subAssNative,
    showStats,
    holdSpeedActive,
    videoFillPill: videoFill.pill,
    cropMode: videoFill.mode,
    onCropMode: videoFill.setMode,
    anime4kMode: anime4k.mode,
    onAnime4kMode: anime4k.setMode,
    anime4kAvailable: anime4k.available,
    subDropToast,
    pipMode,
    drawMode,
    cast,
    pickAnother,
    pickAnotherOrGuide,
    playPauseToggle,
    toggleFullscreen,
    onVolumeWheel,
    isLocalSrc,
    swappingEp,
    swapResolvingKey,
    closePlayer,
    engineStats,
    isP2pEngine,
    setLoaderShowing,
    onLoaderRetry: () => {
      const b = bridgeRef.current;
      if (b) {
        void b.load({ url: src.url, subtitles: src.subtitles, notWebReady: src.notWebReady, isLive: src.meta.id?.startsWith("iptv:"), headers: src.headers });
      }
    },
    bridgeRef,
    strokes,
    hideOthersDrawings,
    clientId,
    selfName,
    selfColor,
    onDrawStart,
    onDrawPoint,
    onDrawEnd,
    showWaiting,
    pendingResumeSec,
    pendingSeekSec,
    skipSegments,
    hasNextEpisode: hasNextEpisodeNow,
    hasNextEpDisplay: canChangeEpisode && !autoNextCancelled && !!adjacent.next,
    nextEp: canChangeEpisode && !autoNextCancelled ? adjacent.next : null,
    nextEpMask,
    pillsVisible: hasStarted || !inRoom,
    allowAutoSkip: !roomGuest,
    seekTo,
    goToEpisode,
    setAutoNextCancelled,
    showChrome,
    ab,
    frameGrabToast: frameGrab.toast,
    onScreenshot: () => frameGrab.trigger(),
    gif,
    clip,
    loaderActive,
    playerShellId: settings.playerShellId,
    shellSnap,
    snapRef,
    fullscreen,
    showDraw: inRoom && roomSnapshot.participants.length > 1 && !cast.castDevice,
    metaId: src.meta.id,
    setAnyMenuOpen,
    onSeekStep: seekStep,
    rememberSubChoice,
    togglePipMode,
    setDrawMode,
    wakeChrome,
    setHideOthersDrawings,
    canPickAnother: !liveOverlay.isLive || !inRoom || isHost,
    resolvedImdbId,
    tmdbKey: settings.tmdbKey ?? null,
    download,
    liveOverlay,
    setDvrOpen,
    openDvr: liveOverlay.isLive ? () => setDvrOpen(true) : undefined,
    sleep,
    adjacentPrev: adjacent.prev,
    adjacentNext: adjacent.next,
    canChangeEpisode,
    inRoom,
    participants: roomSnapshot.participants,
    hostClientId: roomSnapshot.hostClientId,
    syncState: roomSnapshot.syncState,
    avatarsVisible: chromeVisible || !playing,
    presenceMap,
    participantLocations,
    now,
    avatarsCorner,
    avatarsHidden,
    chat,
    sendChat,
    chromeVisible,
    chatCorner,
    chatHidden,
    isHost,
    staleIds: lobby.staleIds,
    guestEscapeReady: lobby.guestEscapeReady,
    onStart: lobby.startHost,
    onPlayWithoutSync: lobby.playWithoutSync,
    guestHostSource,
    liveUrl,
    switcherOpen,
    foreignNotice,
    onDismissForeign: () => setForeignNotice(null),
    streamPillVariant,
    mpvEmbedWindowsActive,
    setStreamCheckOpen,
    dvrOpen,
    setSwitcherOpen,
    onSwitchStream,
    debridSlugs: debrids.map((d) => d.slug),
    isSeriesPlayback,
    episodePanelOpen,
    setEpisodePanelOpen,
    upNextButtonVisible:
      isSeriesPlayback && chromeVisible && !episodePanelOpen && !switcherOpen && !pipMode && !drawMode && !episodesHidden && !roomGuest,
    episodesCorner,
    episodesHidden,
    roomGuest,
    onHostAdvance: broadcastEpisode,
    watchedFor,
    acknowledgeResume,
    showHeaderWarning: showHeaderWarning && !streamPillVariant,
    showNoAudioWarning,
    onUseMpv: () => update({ playerEngine: "mpv" }),
    onDismissNoAudio: () => setNoAudioDismissed(true),
    // Text-sync props (preserved from fork)
    onEnterSync: handleEnterSync,
    syncMode: textSync.syncMode,
    syncApi: textSync,
    syncToast,
    onSyncPlayPause: playPauseToggle,
  };
  return (
    <main
      ref={stageRef}
      data-harbor-player
      dir="ltr"
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
          const resuming = snap.status !== "playing";
          playPauseToggle();
          if (resuming) hideForResume();
        }}
      />
      {!hdrStageActive && <PlayerOverlayLayers {...overlayProps} />}
      <HdrStageBridge
        active={hdrStageRequested}
        payload={{
          snap,
          src,
          shellId: settings.playerShellId,
          engine,
          visible: showChrome,
          fullscreen,
          resolvedImdbId,
          tmdbKey: settings.tmdbKey ?? null,
          canChangeEpisode,
          hasPrevEp: canChangeEpisode && !!adjacent.prev,
          hasNextEp: canChangeEpisode && !!adjacent.next,
          pipMode,
        }}
        handlers={{
          playPause: playPauseToggle,
          fullscreen: toggleFullscreen,
          seek: seekTo,
          seekStep,
          rememberSub: rememberSubChoice,
          pip: togglePipMode,
          cast: () => cast.openCastMenu(null),
          back: closePlayer,
          prevEp: () => goToEpisode(adjacent.prev),
          nextEp: () => goToEpisode(adjacent.next),
          pickAnother: pickAnotherOrGuide,
          screenshot: () => frameGrab.trigger(),
          menuOpen: setAnyMenuOpen,
          activity: wakeChrome,
        }}
      />
    </main>
  );
}
