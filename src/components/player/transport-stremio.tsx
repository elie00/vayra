import { useEffect, useRef, useState } from "react";
import type { PlayerCapabilities, PlayerSnapshot } from "@/lib/player/bridge";
import type { Meta } from "@/lib/cinemeta";
import {
  controlsInSlot,
  PLAYER_CHROME_CHANGED_EVENT,
  readPlayerChromeConfig,
  type PlayerChromeConfig,
  type PlayerSlot,
} from "@/lib/player-chrome";
import { CastModal } from "./cast-modal";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";
import { SeekBar } from "./transport/seek-bar";
import { LiveBadge, GoToLive, LiveSeekBar } from "./transport/live-controls";
import {
  RenderedStremioControl,
  type StremioRenderCtx,
} from "./transport/control-renderer-stremio";

export type TransportStremioProps = {
  snap: PlayerSnapshot;
  capabilities: PlayerCapabilities;
  visible: boolean;
  fullscreen: boolean;
  drawMode: boolean;
  hideOthersDrawings: boolean;
  showDraw: boolean;
  onBack: () => void;
  onPlayPause: () => void;
  onSeek: (sec: number) => void;
  onMute: () => void;
  onVolume: (v: number) => void;
  onAudio: (id: string) => void;
  onSubtitle: (id: string | null) => void;
  onSubDelay: (sec: number) => void;
  onAudioDelay: (sec: number) => void;
  onEnterSync?: () => void;
  onAddSubtitle: (url: string, lang?: string, title?: string) => void;
  onRate: (r: number) => void;
  cropMode?: string;
  onCropMode?: (id: string) => void;
  anime4kMode?: string;
  onAnime4kMode?: (id: string) => void;
  anime4kAvailable?: boolean;
  onPiP: () => void;
  onFullscreen: () => void;
  onCast: () => void;
  onToggleDraw: () => void;
  onToggleHideOthers: () => void;
  onScreenshot: () => void;
  onPickAnother: () => void;
  canPickAnother: boolean;
  title: string;
  subtitle?: string;
  resolution?: string | null;
  quality?: string | null;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  onPrevEp: () => void;
  onNextEp: () => void;
  metaImdbId?: string | null;
  metaTitle?: string | null;
  metaReleaseDate?: string | null;
  meta?: Meta;
  tmdbKey?: string | null;
  season?: number | null;
  episode?: number | null;
  engine: "html5" | "mpv";
  useOverlayPopups?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  download?: DownloadStatus;
  onDownloadStart?: () => void;
  onDownloadCancel?: () => void;
  onDownloadReveal?: () => void;
  onDownloadReset?: () => void;
  onOpenDvr?: () => void;
  sleep?: import("@/views/player/hooks/use-sleep-timer").SleepTimerState;
};

export function TransportStremio(p: TransportStremioProps) {
  const {
    snap,
    capabilities,
    visible,
    fullscreen,
    drawMode,
    hideOthersDrawings,
    showDraw,
    onBack,
    onPlayPause,
    onSeek,
    onMute,
    onVolume,
    onAudio,
    onSubtitle,
    onSubDelay,
    onAudioDelay,
    onEnterSync,
    onAddSubtitle,
    onRate,
    cropMode,
    onCropMode,
    anime4kMode,
    onAnime4kMode,
    anime4kAvailable,
    onPiP,
    onFullscreen,
    onCast,
    onToggleDraw,
    onToggleHideOthers,
    onScreenshot,
    onPickAnother,
    canPickAnother,
    title,
    subtitle,
    resolution,
    quality,
    hasPrevEp,
    hasNextEp,
    onPrevEp,
    onNextEp,
    metaImdbId,
    metaTitle,
    metaReleaseDate,
    meta,
    tmdbKey,
    season,
    episode,
    engine,
    useOverlayPopups,
    onMenuOpenChange,
    download,
    onDownloadStart,
    onDownloadCancel,
    onDownloadReveal,
    onDownloadReset,
    onOpenDvr,
    sleep,
  } = p;

  const playing = snap.status === "playing";
  const showEpisodeNav = hasPrevEp || hasNextEp;
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [anime4kMenuOpen, setAnime4kMenuOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [config, setConfig] = useState<PlayerChromeConfig>(() => readPlayerChromeConfig("stremio"));
  const isLiveChannel = !!meta?.id?.startsWith("iptv:");
  const titleClickable = !!meta && !isLiveChannel;
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMenuOpenChange?.(audioMenuOpen || subtitleMenuOpen || speedMenuOpen || aspectMenuOpen || anime4kMenuOpen);
  }, [audioMenuOpen, subtitleMenuOpen, speedMenuOpen, aspectMenuOpen, anime4kMenuOpen, onMenuOpenChange]);

  useEffect(() => {
    const refresh = () => setConfig(readPlayerChromeConfig("stremio"));
    const onStorage = (e: StorageEvent) => {
      if (e.key === "harbor.player.chrome.profiles.v1") refresh();
    };
    window.addEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const ctx: StremioRenderCtx = {
    snap,
    capabilities,
    drawMode,
    hideOthersDrawings,
    showDraw,
    isWatchTogether: showDraw,
    playing,
    showEpisodeNav,
    isLiveChannel,
    showRemaining,
    active: visible,
    canPickAnother,
    hasPrevEp,
    hasNextEp,
    engine,
    useOverlayPopups,
    customIcons: config.customIcons,
    timeFormat: config.options.timeFormat,
    volumeStyle: config.options.volumeStyle,
    fullscreen,
    title,
    subtitle,
    resolution,
    quality,
    titleClickable,
    onBack,
    onFullscreen,
    onTitleClick: () => setCastModalOpen(true),
    meta,
    metaImdbId,
    metaTitle,
    metaReleaseDate,
    season,
    episode,
    download,
    sleep,
    setShowRemaining,
    setAudioMenuOpen,
    setSubtitleMenuOpen,
    setSpeedMenuOpen,
    setAspectMenuOpen,
    cropMode,
    onCropMode,
    setAnime4kMenuOpen,
    anime4kMode,
    onAnime4kMode,
    anime4kAvailable,
    onPlayPause,
    onMute,
    onVolume,
    onAudio,
    onSubtitle,
    onSubDelay,
    onAudioDelay,
    onEnterSync,
    onAddSubtitle,
    onRate,
    onPiP,
    onCast,
    onToggleDraw,
    onToggleHideOthers,
    onScreenshot,
    onPickAnother,
    onPrevEp,
    onNextEp,
    onDownloadStart,
    onDownloadCancel,
    onDownloadReveal,
    onDownloadReset,
    onOpenDvr,
  };

  const renderSlot = (slot: PlayerSlot) =>
    controlsInSlot(config, slot).map((c) => (
      <RenderedStremioControl key={c.id} id={c.id} ctx={ctx} />
    ));

  return (
    <>
      <div
        data-tauri-drag-region={fullscreen ? undefined : ""}
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[88px] items-center justify-between bg-gradient-to-b from-black/35 via-black/15 to-transparent px-6 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3">
          {renderSlot("top-left")}
        </div>
        <div className="flex items-center gap-1">
          <div className="pointer-events-auto flex items-center gap-1">
            {renderSlot("top-right")}
          </div>
        </div>
      </div>

      <div
        ref={controlsRef}
        dir="ltr"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-gradient-to-t from-black/35 to-transparent px-8 pb-3 pt-12 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex h-6 items-center">
          {isLiveChannel ? (
            <>
              <LiveBadge />
              <div className="flex-1">
                <LiveSeekBar durationSec={snap.durationSec} onSeek={onSeek} active={visible} />
              </div>
              <GoToLive durationSec={snap.durationSec} onSeek={onSeek} />
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <SeekBar durationSec={snap.durationSec} onSeek={onSeek} active={visible} />
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1">
          {renderSlot("bottom-left")}
          {renderSlot("bottom-center")}
          <div className="flex-1" />
          {renderSlot("bottom-right")}
        </div>
      </div>

      {meta && !isLiveChannel && (
        <CastModal
          open={castModalOpen}
          onClose={() => setCastModalOpen(false)}
          meta={meta}
          tmdbKey={tmdbKey ?? null}
        />
      )}
    </>
  );
}
