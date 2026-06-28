import { Settings2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { PlayerCapabilities, PlayerSnapshot } from "@/lib/player/bridge";
import type { Meta } from "@/lib/cinemeta";
import { CastModal } from "./cast-modal";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";
import { TransportStremio } from "./transport-stremio";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { resolveChromeTheme } from "@/lib/theme";
import { SeekBar } from "./transport/seek-bar";
import { LiveBadge, GoToLive, LiveSeekBar } from "./transport/live-controls";
import { PipChrome } from "./transport/pip-chrome";
import { fmtTime } from "./transport/transport-utils";
import {
  controlsInSlot,
  PLAYER_CHROME_CHANGED_EVENT,
  readPlayerChromeConfig,
  type PlayerChromeConfig,
} from "@/lib/player-chrome";
import { renderControl, type ControlContext } from "./transport/control-renderer";

// Wrapper fin : choisit le layout AVANT d'appeler les hooks. La variante classique
// (TransportClassic) porte tous ses hooks ; ainsi basculer le PiP en thème Stremio
// ne change plus l'ordre des hooks d'un même composant (évite un crash React).
export function Transport(props: Parameters<typeof TransportClassic>[0]) {
  const { settings } = useSettings();
  const isStremioLayout =
    resolveChromeTheme(settings.theme, settings.playerChromeTheme) === "stremio";
  if (isStremioLayout && !props.pipMode) {
    return <TransportStremio {...props} />;
  }
  return <TransportClassic {...props} />;
}

function TransportClassic({
  snap,
  capabilities,
  visible,
  fullscreen,
  drawMode,
  hideOthersDrawings,
  pipMode,
  showDraw,
  onBack,
  onPlayPause,
  onSeek,
  onSeekStep,
  onMute,
  onVolume,
  onAudio,
  onSubtitle,
  onSubDelay,
  onAudioDelay,
  onEnterSync,
  onTranslate,
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
  hoverTitle,
  hoverSub,
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
}: {
  snap: PlayerSnapshot;
  capabilities: PlayerCapabilities;
  visible: boolean;
  fullscreen: boolean;
  drawMode: boolean;
  hideOthersDrawings: boolean;
  pipMode?: boolean;
  showDraw: boolean;
  onBack: () => void;
  onPlayPause: () => void;
  onSeek: (sec: number) => void;
  onSeekStep: (delta: number) => void;
  onMute: () => void;
  onVolume: (v: number) => void;
  onAudio: (id: string) => void;
  onSubtitle: (id: string | null) => void;
  onSubDelay: (sec: number) => void;
  onAudioDelay: (sec: number) => void;
  onEnterSync?: () => void;
  onTranslate?: (targetLangCode: string) => Promise<{ ok: boolean; error?: string }>;
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
  hoverTitle?: string;
  hoverSub?: string;
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
}) {
  const t = useT();
  const { settings } = useSettings();
  const playing = snap.status === "playing";
  const showEpisodeNav = hasPrevEp || hasNextEp;
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [anime4kMenuOpen, setAnime4kMenuOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [chromeConfig, setChromeConfig] = useState<PlayerChromeConfig>(() =>
    readPlayerChromeConfig("default"),
  );
  const isLiveChannel = !!meta?.id?.startsWith("iptv:");
  const titleClickable = !!meta && !isLiveChannel;
  const controlsRef = useRef<HTMLDivElement>(null);
  const [mid, setMid] = useState(false);
  const [compact, setCompact] = useState(false);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    onMenuOpenChange?.(audioMenuOpen || subtitleMenuOpen || speedMenuOpen || aspectMenuOpen || anime4kMenuOpen);
  }, [audioMenuOpen, subtitleMenuOpen, speedMenuOpen, aspectMenuOpen, anime4kMenuOpen, onMenuOpenChange]);
  useEffect(() => {
    const refresh = () => setChromeConfig(readPlayerChromeConfig("default"));
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
  useEffect(() => {
    if (pipMode) return;
    const el = controlsRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setMid(w < 1300);
      setCompact(w < 1000);
      setTight(w < 600);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [pipMode]);
  if (pipMode) {
    return (
      <PipChrome
        snap={snap}
        visible={visible}
        playing={playing}
        hoverTitle={hoverTitle}
        hoverSub={hoverSub}
        hasPrevEp={hasPrevEp}
        hasNextEp={hasNextEp}
        onExitPip={onPiP}
        onPlayPause={onPlayPause}
        onSeek={onSeek}
        onSeekStep={onSeekStep}
        onMute={onMute}
        onVolume={onVolume}
        onPrevEp={onPrevEp}
        onNextEp={onNextEp}
      />
    );
  }
  const ctx: ControlContext = {
    t,
    snap,
    capabilities,
    fullscreen,
    drawMode,
    hideOthersDrawings,
    showDraw,
    isWatchTogether: showDraw,
    playing,
    mid,
    compact,
    tight,
    active: visible,
    isLiveChannel,
    showEpisodeNav,
    hasPrevEp,
    hasNextEp,
    canPickAnother,
    engine,
    useOverlayPopups,
    customIcons: chromeConfig.customIcons,
    controlVariants: Object.fromEntries(
      chromeConfig.controls.map((c) => [c.id, c.variant ?? "auto"]),
    ),
    timeFormat: chromeConfig.options.timeFormat,
    volumeStyle: chromeConfig.options.volumeStyle,
    title,
    subtitle,
    titleClickable,
    titleScale: settings.playerTitleScale,
    titleSeriesFirst: settings.playerTitleSeriesFirst,
    onBack,
    onTitleClick: () => setCastModalOpen(true),
    meta,
    metaImdbId,
    metaTitle,
    metaReleaseDate,
    season,
    episode,
    download,
    sleep,
    onPlayPause,
    onSeekStep,
    onMute,
    onVolume,
    onAudio,
    onSubtitle,
    onSubDelay,
    onAudioDelay,
    onEnterSync,
    onTranslate,
    onAddSubtitle,
    onRate,
    onPiP,
    onFullscreen,
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
  };
  return (
    <>
      <div
        data-tauri-drag-region={fullscreen ? undefined : ""}
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/55 via-black/15 to-transparent px-7 pt-4 pb-8 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex items-start gap-2">
          {controlsInSlot(chromeConfig, "top-left").map((c) => (
            <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <div className="pointer-events-auto flex items-start gap-2">
            {controlsInSlot(chromeConfig, "top-right").map((c) => (
              <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={controlsRef}
        dir="ltr"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 bg-gradient-to-t from-black/70 via-black/25 to-transparent ${
          tight ? "px-3 pt-6 pb-3" : "px-7 pt-10 pb-5"
        } transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <div dir="ltr" className="pointer-events-auto flex items-center gap-3">
          {isLiveChannel ? (
            <>
              <LiveBadge />
              <div className="flex-1">
                <LiveSeekBar durationSec={snap.durationSec} onSeek={onSeek} active={visible} />
              </div>
              <GoToLive durationSec={snap.durationSec} onSeek={onSeek} />
            </>
          ) : (
            <>
              {controlsInSlot(chromeConfig, "seek-leading").map((c) => (
                <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
              ))}
              <div className="flex-1">
                <SeekBar durationSec={snap.durationSec} onSeek={onSeek} active={visible} />
              </div>
              {controlsInSlot(chromeConfig, "seek-trailing").map((c) => (
                <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
              ))}
            </>
          )}
        </div>
        <div className={`pointer-events-auto grid items-center ${
          compact ? "grid-cols-[auto_1fr_auto] gap-2" : "grid-cols-[1fr_auto_1fr] gap-4"
        }`}>
          <div className="flex min-w-0 items-center gap-2 justify-self-start">
            {controlsInSlot(chromeConfig, "bottom-left").map((c) => (
              <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {controlsInSlot(chromeConfig, "bottom-center").map((c) => (
              <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5 justify-self-end">
            {controlsInSlot(chromeConfig, "bottom-right").map((c) => (
              <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
            ))}
          </div>
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

export { fmtTime, Settings2 };
