import { MoreHorizontal, Settings2 } from "lucide-react";
import { Fragment, Suspense, lazy, useEffect, useRef, useState } from "react";
import type { PlayerCapabilities, PlayerSnapshot } from "@/lib/player/bridge";
import type { Meta } from "@/lib/cinemeta";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { resolveChromeTheme } from "@/lib/theme";
import { SeekBar } from "./transport/seek-bar";
import { LiveBadge, GoToLive, LiveSeekBar } from "./transport/live-controls";
import { PipChrome } from "./transport/pip-chrome";
import { fmtTime } from "./transport/transport-utils";
import {
  controlsInSlot,
  PLAYER_CHROME_CHANGED_EVENT,
  MOBILE_PLAYER_CONFIG,
  readPlayerChromeConfig,
  writePlayerChromeConfig,
  type PlayerChromeConfig,
  type TimeFormat,
} from "@/lib/player-chrome";
import { renderControl, type ControlContext } from "./transport/control-renderer";
import { isMobileTauri } from "@/lib/platform";
import { SongIdToast } from "@/components/song-id-toast";
import { useCastModalPlay } from "./use-cast-modal-play";
import { LUMA_OPEN_EVENT } from "@/lib/luma";

const CastModal = lazy(() => import("./cast-modal").then((m) => ({ default: m.CastModal })));
const TransportStremio = lazy(() => import("./transport-stremio").then((m) => ({ default: m.TransportStremio })));
const TransportKids = lazy(() => import("./transport-kids").then((m) => ({ default: m.TransportKids })));
const MobileMoreSheet = lazy(() => import("./mobile-more-sheet").then((m) => ({ default: m.MobileMoreSheet })));

export function Transport({
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
  onClearDraw,
  onScreenshot,
  onPickAnother,
  canPickAnother,
  title,
  subtitle,
  resolution,
  quality,
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
  onDownloadPause,
  onDownloadResume,
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
  onClearDraw: () => void;
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
  engine: "html5" | "mpv" | "exo";
  useOverlayPopups?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  download?: DownloadStatus;
  onDownloadStart?: () => void;
  onDownloadPause?: () => void;
  onDownloadResume?: () => void;
  onDownloadReveal?: () => void;
  onDownloadReset?: () => void;
  onOpenDvr?: () => void;
  sleep?: import("@/views/player/hooks/use-sleep-timer").SleepTimerState;
}) {
  const t = useT();
  const { settings } = useSettings();
  const kid = useActiveKid();
  const isStremioLayout = resolveChromeTheme(settings.theme, settings.playerChromeTheme) === "stremio";
  const playing = snap.status === "playing";
  const showEpisodeNav = hasPrevEp || hasNextEp;
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [anime4kMenuOpen, setAnime4kMenuOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [castModalInitialView, setCastModalInitialView] = useState<"title" | "queue">("title");
  const [savedChromeConfig, setChromeConfig] = useState<PlayerChromeConfig>(() =>
    readPlayerChromeConfig("default"),
  );
  // A phone gets its own lean layout; the desktop layout stays customisable.
  const mobile = isMobileTauri();
  const chromeConfig = mobile ? MOBILE_PLAYER_CONFIG : savedChromeConfig;
  const [moreOpen, setMoreOpen] = useState(false);
  const isLiveChannel = !!meta?.id?.startsWith("iptv:");
  const titleClickable = !!meta && !isLiveChannel;
  const { openMeta, exitPlayer } = useView();
  const castModalPlay = useCastModalPlay();
  useEffect(() => {
    const openLuma = () => {
      setCastModalInitialView("queue");
      setCastModalOpen(true);
    };
    window.addEventListener(LUMA_OPEN_EVENT, openLuma);
    return () => window.removeEventListener(LUMA_OPEN_EVENT, openLuma);
  }, []);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [mid, setMid] = useState(false);
  const [compact, setCompact] = useState(false);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    onMenuOpenChange?.(audioMenuOpen || subtitleMenuOpen || speedMenuOpen || aspectMenuOpen || anime4kMenuOpen || moreOpen);
  }, [audioMenuOpen, subtitleMenuOpen, speedMenuOpen, aspectMenuOpen, anime4kMenuOpen, moreOpen, onMenuOpenChange]);
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
  if (isStremioLayout && !pipMode) {
    return (
      <Suspense fallback={null}>
        <TransportStremio
        snap={snap}
        capabilities={capabilities}
        visible={visible}
        fullscreen={fullscreen}
        drawMode={drawMode}
        hideOthersDrawings={hideOthersDrawings}
        showDraw={showDraw}
        onBack={onBack}
        onPlayPause={onPlayPause}
        onSeek={onSeek}
        onMute={onMute}
        onVolume={onVolume}
        onAudio={onAudio}
        onSubtitle={onSubtitle}
        onSubDelay={onSubDelay}
        onAudioDelay={onAudioDelay}
        onEnterSync={onEnterSync}
        onAddSubtitle={onAddSubtitle}
        onRate={onRate}
        cropMode={cropMode}
        onCropMode={onCropMode}
        anime4kMode={anime4kMode}
        onAnime4kMode={onAnime4kMode}
        anime4kAvailable={anime4kAvailable}
        onPiP={onPiP}
        onFullscreen={onFullscreen}
        onCast={onCast}
        onToggleDraw={onToggleDraw}
        onToggleHideOthers={onToggleHideOthers}
        onClearDraw={onClearDraw}
        onScreenshot={onScreenshot}
        onPickAnother={onPickAnother}
        canPickAnother={canPickAnother}
        title={title}
        subtitle={subtitle}
        resolution={resolution}
        quality={quality}
        hasPrevEp={hasPrevEp}
        hasNextEp={hasNextEp}
        onPrevEp={onPrevEp}
        onNextEp={onNextEp}
        metaImdbId={metaImdbId}
        metaTitle={metaTitle}
        metaReleaseDate={metaReleaseDate}
        meta={meta}
        tmdbKey={tmdbKey}
        season={season}
        episode={episode}
        engine={engine}
        useOverlayPopups={useOverlayPopups}
        onMenuOpenChange={onMenuOpenChange}
        download={download}
        onDownloadStart={onDownloadStart}
        onDownloadPause={onDownloadPause}
        onDownloadResume={onDownloadResume}
        onDownloadReveal={onDownloadReveal}
        onDownloadReset={onDownloadReset}
        onOpenDvr={onOpenDvr}
        sleep={sleep}
      />
      </Suspense>
    );
  }
  if (kid && !pipMode) {
    return (
      <Suspense fallback={null}>
        <TransportKids
          snap={snap}
          capabilities={capabilities}
          visible={visible}
          fullscreen={fullscreen}
          title={title}
          resolution={resolution}
          onBack={onBack}
          onPlayPause={onPlayPause}
          onSeek={onSeek}
          onSeekStep={onSeekStep}
          onMute={onMute}
          onVolume={onVolume}
          onSubtitle={onSubtitle}
          onFullscreen={onFullscreen}
          onPickAnother={onPickAnother}
          canPickAnother={canPickAnother}
        />
      </Suspense>
    );
  }
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
  const onCycleTimeFormat = () => {
    const cur = readPlayerChromeConfig("default");
    const nextFmt: TimeFormat = cur.options.timeFormat === "remaining" ? "start-end" : "remaining";
    const next = { ...cur, options: { ...cur.options, timeFormat: nextFmt } };
    writePlayerChromeConfig("default", next);
    setChromeConfig(next);
  };
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
    onCycleTimeFormat,
    volumeStyle: chromeConfig.options.volumeStyle,
    seekBackStepSec: settings.seekBackStepSec,
    seekForwardStepSec: settings.seekForwardStepSec,
    title,
    subtitle,
    titleClickable,
    titleScale: settings.playerTitleScale,
    titleSeriesFirst: settings.playerTitleSeriesFirst,
    onBack,
    onTitleClick: () => {
      setCastModalInitialView("title");
      setCastModalOpen(true);
    },
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
    onAddSubtitle,
    onRate,
    onPiP,
    onFullscreen,
    onCast,
    onLuma: () => {
      setCastModalInitialView("queue");
      setCastModalOpen(true);
    },
    onToggleDraw,
    onToggleHideOthers,
    onClearDraw,
    onScreenshot,
    onPickAnother,
    onPrevEp,
    onNextEp,
    onDownloadStart,
    onDownloadPause,
    onDownloadResume,
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
      <SongIdToast />
      <div
        data-tauri-drag-region={fullscreen ? undefined : ""}
        aria-hidden={!visible}
        inert={!visible || undefined}
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/78 via-black/30 to-transparent ps-[calc(1.75rem+var(--vayra-safe-left,0px))] pe-[calc(1.75rem+var(--vayra-safe-right,0px))] pt-5 pb-12 max-sm:ps-[calc(1rem+var(--vayra-safe-left,0px))] max-sm:pe-[calc(1rem+var(--vayra-safe-right,0px))] max-sm:pt-[calc(var(--harbor-status-bar,0px)+0.5rem)] transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-reduce:transform-none ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        }`}
      >
        <div className={`${visible ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-3`}>
          {controlsInSlot(chromeConfig, "top-left").map((c) => (
            <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className={`${visible ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-1.5`}>
            {controlsInSlot(chromeConfig, "top-right").map((c) => (
              <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={controlsRef}
        dir="ltr"
        aria-hidden={!visible}
        inert={!visible || undefined}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/88 via-black/42 to-transparent ${
          tight
            ? "ps-[calc(0.75rem+var(--vayra-safe-left,0px))] pe-[calc(0.75rem+var(--vayra-safe-right,0px))] pt-8 pb-[calc(0.75rem+var(--vayra-safe-bottom,0px))]"
            : "ps-[calc(1.5rem+var(--vayra-safe-left,0px))] pe-[calc(1.5rem+var(--vayra-safe-right,0px))] pt-14 pb-[calc(1.25rem+var(--vayra-safe-bottom,0px))]"
        } transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-reduce:transform-none ${
          visible ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
        }`}
      >
        <div
          className={`mx-auto flex w-full max-w-[1380px] flex-col gap-2.5 ${
            tight
              ? ""
              : "rounded-[22px] border border-white/[0.09] bg-[#0b0c0f]/58 px-4 py-3 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.92)] backdrop-blur-2xl"
          }`}
        >
          <div dir="ltr" className={`${visible ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-3`}>
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
          <div className={`${visible ? "pointer-events-auto" : "pointer-events-none"} grid items-center ${
            // A phone keeps the playback buttons centred however narrow the bar.
            compact && !mobile ? "grid-cols-[auto_1fr_auto] gap-2" : "grid-cols-[1fr_auto_1fr] gap-4"
          }`}>
            <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
              {controlsInSlot(chromeConfig, "bottom-left").map((c) => (
                <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {controlsInSlot(chromeConfig, "bottom-center").map((c) => (
                <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
              ))}
            </div>
            <div className="flex items-center gap-1 justify-self-end">
              {controlsInSlot(chromeConfig, "bottom-right").map((c) => (
                <Fragment key={c.id}>{renderControl(c.id, ctx)}</Fragment>
              ))}
              {mobile && (
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-label={t("More options")}
                  aria-expanded={moreOpen}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors ${moreOpen ? "bg-white/20" : "active:bg-white/15"}`}
                >
                  <MoreHorizontal size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {mobile && moreOpen && (
        <Suspense fallback={null}>
          <MobileMoreSheet ctx={ctx} onClose={() => setMoreOpen(false)} />
        </Suspense>
      )}

      {meta && !isLiveChannel && castModalOpen && (
        <Suspense fallback={null}>
          <CastModal
            open={castModalOpen}
            onClose={() => setCastModalOpen(false)}
            meta={meta}
            tmdbKey={tmdbKey ?? null}
            onOpenDetail={(m) => {
              setCastModalOpen(false);
              exitPlayer();
              openMeta(m);
            }}
            onPlay={(m, ep) => {
              setCastModalOpen(false);
              castModalPlay(m, ep);
            }}
            currentEpisode={
              season != null && episode != null ? { season, episode } : null
            }
            initialView={castModalInitialView}
          />
        </Suspense>
      )}
    </>
  );
}

export { fmtTime, Settings2 };
