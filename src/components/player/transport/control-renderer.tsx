import { t as translate } from "@/lib/i18n";
import { Camera, ChevronLeft, Info, ListVideo, Maximize, Minimize, Pause, PictureInPicture2, Play, Replace, Tv } from "lucide-react";
import type { ReactNode } from "react";
import type { PlayerCapabilities, PlayerSnapshot } from "@/lib/player/bridge";
import type { Meta } from "@/lib/cinemeta";
import { getCustomIcon, type ControlVariant, type CustomIconMap, type PlayerControlId, type TimeFormat, type VolumeStyle } from "@/lib/player-chrome";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";
import { renderCustomIconControl } from "./custom-icon-renderer";
import { realQualityLabel } from "@/lib/player/resolution-label";
import {
  formatTransferEta,
  formatTransferRate,
  playbackSourceStatus,
} from "./playback-source-status";

function getControlState(id: PlayerControlId, ctx: ControlContext): string | undefined {
  const preview = ctx.previewStates?.[id];
  if (preview) return preview;
  switch (id) {
    case "play-pause":
      return ctx.playing ? "playing" : "paused";
    case "fullscreen":
      return ctx.fullscreen ? "fullscreen" : "windowed";
    case "draw-toggle":
      return ctx.drawMode ? "active" : "inactive";
    case "dvr":
      return ctx.isLiveChannel ? "recording" : "idle";
    case "cast":
      return ctx.capabilities.chromecast ? "connected" : "idle";
    case "pip":
      return "inactive";
    case "download":
      return ctx.download?.kind ?? "idle";
  }
  return undefined;
}
import { SubtitleMenu } from "../subtitle-menu";
import { AudioMenu } from "../audio-menu";
import { DownloadButton } from "./download-button";
import { Tooltip } from "./tooltip";
import { BigButton } from "./big-button";
import { DvrButton } from "./dvr-button";
import { VolumeControl } from "./volume-control";
import { SpeedMenu } from "./speed-menu";
import { AspectMenu } from "./aspect-menu";
import { Anime4kMenu } from "./anime4k-menu";
import { HdrToggleBigBtn } from "./hdr-toggle-btn";
import type { Anime4kChoice } from "@/views/player/hooks/use-anime4k";
import { DrawToggle } from "./draw-toggle";
import { CastButton } from "./cast-button";
import { SeekStepBtn } from "./seek-step-btn";
import { EpisodeNavBtn } from "./episode-nav-btn";
import { TimeStart, TimeEnd } from "./time-display";
import { WindowControlButtons } from "./window-control-buttons";
import { IdentifySongButton } from "@/components/identify-song-button";

export type ControlContext = {
  t?: (key: string, vars?: Record<string, string | number>) => string;
  snap: PlayerSnapshot;
  capabilities: PlayerCapabilities;
  fullscreen: boolean;
  drawMode: boolean;
  hideOthersDrawings: boolean;
  showDraw: boolean;
  isWatchTogether?: boolean;
  playing: boolean;
  mid: boolean;
  compact: boolean;
  tight: boolean;
  active: boolean;
  isLiveChannel: boolean;
  showEpisodeNav: boolean;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  canPickAnother: boolean;
  engine: "html5" | "mpv" | "exo";
  useOverlayPopups?: boolean;
  editing?: boolean;
  customIcons?: CustomIconMap;
  previewStates?: Partial<Record<PlayerControlId, string>>;
  controlVariants?: Partial<Record<PlayerControlId, ControlVariant>>;
  timeFormat?: TimeFormat;
  onCycleTimeFormat?: () => void;
  volumeStyle?: VolumeStyle;
  seekBackStepSec: number;
  seekForwardStepSec: number;
  title?: string;
  subtitle?: string;
  titleClickable?: boolean;
  titleScale?: number;
  titleSeriesFirst?: boolean;
  onBack?: () => void;
  onTitleClick?: () => void;
  meta?: Meta;
  metaImdbId?: string | null;
  metaTitle?: string | null;
  metaReleaseDate?: string | null;
  season?: number | null;
  episode?: number | null;
  download?: DownloadStatus;
  sleep?: import("@/views/player/hooks/use-sleep-timer").SleepTimerState;
  onPlayPause: () => void;
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
  onPiP: () => void;
  onFullscreen: () => void;
  onCast: () => void;
  onLuma?: () => void;
  onToggleDraw: () => void;
  onToggleHideOthers: () => void;
  onClearDraw: () => void;
  onScreenshot: () => void;
  onPickAnother: () => void;
  onPrevEp: () => void;
  onNextEp: () => void;
  onDownloadStart?: () => void;
  onDownloadPause?: () => void;
  onDownloadResume?: () => void;
  onDownloadReveal?: () => void;
  onDownloadReset?: () => void;
  onOpenDvr?: () => void;
  setAudioMenuOpen: (v: boolean) => void;
  setSubtitleMenuOpen: (v: boolean) => void;
  setSpeedMenuOpen: (v: boolean) => void;
  setAspectMenuOpen: (v: boolean) => void;
  cropMode?: string;
  onCropMode?: (id: string) => void;
  setAnime4kMenuOpen: (v: boolean) => void;
  anime4kMode?: string;
  onAnime4kMode?: (id: string) => void;
  anime4kAvailable?: boolean;
};

export function renderControl(id: PlayerControlId, ctx: ControlContext): ReactNode {
  const t = ctx.t ?? translate;
  const state = getControlState(id, ctx);
  const iconUrl = getCustomIcon(ctx.customIcons, id, state);
  if (iconUrl) {
    const custom = renderCustomIconControl(id, ctx, iconUrl);
    if (custom !== undefined) return custom;
  }
  switch (id) {
    case "back": {
      if (!ctx.onBack) return null;
      return (
        <Tooltip label={t("Back")} side="bottom">
          <button
            type="button"
            onClick={ctx.onBack}
            aria-label={t("Back")}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-[#0b0c0f]/60 text-white backdrop-blur-xl transition-[background-color,border-color,transform] duration-150 hover:border-white/24 hover:bg-white/16 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none"
          >
            <ChevronLeft size={21} strokeWidth={2.2} className="dir-icon" />
          </button>
        </Tooltip>
      );
    }
    case "title-info": {
      if (!ctx.title) return null;
      const scale = ctx.titleScale ?? 1;
      const swap = !!ctx.titleSeriesFirst && !!ctx.subtitle;
      const primary = swap ? ctx.subtitle : ctx.title;
      const secondary = swap ? ctx.title : ctx.subtitle;
      const qual = realQualityLabel(ctx.snap.videoWidth, ctx.snap.videoHeight);
      const sourceStatus = playbackSourceStatus(ctx.snap, ctx.download);
      const transferRate = sourceStatus?.bytesPerSecond != null
        ? formatTransferRate(sourceStatus.bytesPerSecond)
        : null;
      const transferEta = sourceStatus?.etaSeconds != null
        ? formatTransferEta(sourceStatus.etaSeconds, t)
        : null;
      const lines = (
        <>
          <div className="flex items-center gap-2">
            <h1
              style={{ fontSize: `${Math.round(18 * scale)}px` }}
              className="font-display font-semibold leading-tight tracking-[-0.02em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]"
            >
              {primary}
            </h1>
            {qual && (
              <span className="shrink-0 rounded-full border border-white/16 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md">
                {qual}
              </span>
            )}
          </div>
          {secondary && (
            <p
              style={{ fontSize: `${Math.round(12.5 * scale)}px` }}
              className="text-white/70 drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)]"
            >
              {secondary}
            </p>
          )}
          {sourceStatus && (
            <span
              role="status"
              aria-live="polite"
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold tabular-nums backdrop-blur-md ${
                sourceStatus.tone === "error"
                  ? "border-danger/35 bg-danger/20 text-red-100"
                  : sourceStatus.tone === "success"
                    ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100"
                    : "border-white/14 bg-black/45 text-white/85"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  sourceStatus.tone === "error"
                    ? "bg-danger"
                    : sourceStatus.tone === "success"
                      ? "bg-emerald-300"
                      : "animate-pulse bg-white/75"
                }`}
              />
              {t(sourceStatus.label)}
              {sourceStatus.progress != null ? ` ${sourceStatus.progress}%` : ""}
              {transferRate ? <span className="text-white/55">· {transferRate}</span> : null}
              {transferEta ? <span className="text-white/55">· {transferEta}</span> : null}
            </span>
          )}
        </>
      );
      if (ctx.titleClickable && ctx.onTitleClick) {
        return (
          <button
            type="button"
            onClick={ctx.onTitleClick}
            className="pointer-events-auto group inline-flex items-center gap-2 rounded-xl px-2.5 py-1 text-start transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label={t("Title info")}
          >
            <div className="flex flex-col items-start gap-0.5">{lines}</div>
            <Info
              size={14}
              strokeWidth={2.1}
              className="text-white/50 transition-colors group-hover:text-white/90"
            />
          </button>
        );
      }
      return (
        <div className="pointer-events-none flex flex-col items-start gap-0.5 text-start">{lines}</div>
      );
    }
    case "time-start": {
      return (
        <TimeStart
          durationSec={ctx.snap.durationSec}
          isLiveChannel={ctx.isLiveChannel}
          tight={ctx.tight}
          active={ctx.active}
        />
      );
    }
    case "time-end": {
      return (
        <TimeEnd
          durationSec={ctx.snap.durationSec}
          rate={ctx.snap.rate}
          timeFormat={ctx.timeFormat}
          isLiveChannel={ctx.isLiveChannel}
          tight={ctx.tight}
          active={ctx.active}
          onCycle={ctx.editing ? undefined : ctx.onCycleTimeFormat}
        />
      );
    }
    case "volume": {
      if (ctx.tight) return null;
      return (
        <VolumeControl
          snap={ctx.snap}
          onMute={ctx.onMute}
          onVolume={ctx.onVolume}
          capabilities={ctx.capabilities}
          style={ctx.volumeStyle ?? "slider"}
        />
      );
    }
    case "dvr": {
      if (ctx.tight || !ctx.isLiveChannel || !ctx.onOpenDvr) return null;
      return <DvrButton channelName={ctx.meta?.name ?? t("Live")} onClick={ctx.onOpenDvr} />;
    }
    case "download": {
      if (ctx.mid || ctx.isLiveChannel) return null;
      if (!ctx.download || !ctx.onDownloadStart || !ctx.onDownloadPause || !ctx.onDownloadResume || !ctx.onDownloadReveal || !ctx.onDownloadReset) {
        return null;
      }
      return (
        <DownloadButton
          status={ctx.download}
          onStart={ctx.onDownloadStart}
          onPause={ctx.onDownloadPause}
          onResume={ctx.onDownloadResume}
          onReveal={ctx.onDownloadReveal}
          onReset={ctx.onDownloadReset}
        />
      );
    }
    case "prev-episode": {
      if (ctx.tight || !ctx.showEpisodeNav) return null;
      const v = ctx.controlVariants?.["prev-episode"] ?? "auto";
      const iconOnly = v === "condensed" ? true : v === "full" ? false : ctx.mid;
      return (
        <EpisodeNavBtn
          direction="prev"
          label={t("Previous Episode")}
          onClick={ctx.onPrevEp}
          disabled={!ctx.hasPrevEp}
          iconOnly={iconOnly}
        />
      );
    }
    case "seek-back": {
      if (ctx.tight || ctx.isLiveChannel) return null;
      return <SeekStepBtn direction="back" seconds={10} onSeekStep={ctx.onSeekStep} />;
    }
    case "play-pause": {
      return (
        <Tooltip label={ctx.playing ? t("Pause") : t("Play")}>
          <button
            type="button"
            onClick={ctx.onPlayPause}
            className={`flex items-center justify-center rounded-full bg-white text-[#0a0b0d] shadow-[0_10px_28px_-10px_rgba(0,0,0,0.85)] transition-[transform,opacity] duration-150 hover:scale-[1.04] hover:opacity-95 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:ring-offset-2 focus-visible:ring-offset-black/70 motion-reduce:transition-none motion-reduce:hover:scale-100 ${
              ctx.tight ? "h-10 w-10" : ctx.compact ? "h-11 w-11" : "h-12 w-12"
            }`}
            aria-label={ctx.playing ? t("Pause") : t("Play")}
          >
            {ctx.playing ? (
              <Pause size={ctx.tight ? 18 : 20} strokeWidth={0} fill="currentColor" />
            ) : (
              <Play size={ctx.tight ? 18 : 20} strokeWidth={0} fill="currentColor" className="translate-x-[1px]" />
            )}
          </button>
        </Tooltip>
      );
    }
    case "seek-forward": {
      if (ctx.tight || ctx.isLiveChannel) return null;
      return <SeekStepBtn direction="forward" seconds={10} onSeekStep={ctx.onSeekStep} />;
    }
    case "next-episode": {
      if (ctx.tight || !ctx.showEpisodeNav) return null;
      const v = ctx.controlVariants?.["next-episode"] ?? "auto";
      const iconOnly = v === "condensed" ? true : v === "full" ? false : ctx.mid;
      return (
        <EpisodeNavBtn
          direction="next"
          label={t("Next Episode")}
          onClick={ctx.onNextEp}
          disabled={!ctx.hasNextEp}
          iconOnly={iconOnly}
        />
      );
    }
    case "pick-another": {
      if (ctx.tight || !ctx.canPickAnother) return null;
      return (
        <BigButton
          onClick={ctx.onPickAnother}
          ariaLabel={ctx.isLiveChannel ? t("TV Guide") : t("Switch stream")}
          tooltip={ctx.isLiveChannel ? t("TV Guide") : t("Switch stream")}
        >
          {ctx.isLiveChannel ? (
            <Tv size={19} strokeWidth={1.9} />
          ) : (
            <Replace size={19} strokeWidth={1.9} />
          )}
        </BigButton>
      );
    }
    case "audio-menu": {
      if (ctx.tight || ctx.engine === "html5") return null;
      return (
        <AudioMenu
          tracks={ctx.snap.audioTracks}
          selectedId={ctx.snap.audioTracks.find((t) => t.selected)?.id ?? null}
          delaySec={ctx.snap.audioDelaySec}
          engine={ctx.engine}
          onSelect={ctx.onAudio}
          onDelay={ctx.onAudioDelay}
          onOpenChange={ctx.setAudioMenuOpen}
          useOverlayPopup={ctx.useOverlayPopups}
        />
      );
    }
    case "subtitle-menu": {
      if (ctx.isLiveChannel && ctx.snap.subtitleTracks.length === 0) return null;
      return (
        <SubtitleMenu
          tracks={ctx.snap.subtitleTracks}
          selectedId={ctx.snap.subtitleTracks.find((t) => t.selected)?.id ?? null}
          delaySec={ctx.snap.subDelaySec}
          onSelect={ctx.onSubtitle}
          onDelay={ctx.onSubDelay}
          onEnterSync={ctx.onEnterSync}
          onTranslate={ctx.onTranslate}
          onAddSubtitle={ctx.onAddSubtitle}
          metaImdbId={ctx.metaImdbId}
          metaTitle={ctx.metaTitle}
          metaReleaseDate={ctx.metaReleaseDate}
          season={ctx.season}
          episode={ctx.episode}
          useOverlayPopup={ctx.useOverlayPopups}
          onOpenChange={ctx.setSubtitleMenuOpen}
        />
      );
    }
    case "speed-menu": {
      if (ctx.compact || ctx.isLiveChannel) return null;
      return (
        <SpeedMenu
          rate={ctx.snap.rate}
          onRate={ctx.onRate}
          sleep={ctx.sleep}
          onOpenChange={ctx.setSpeedMenuOpen}
        />
      );
    }
    case "aspect-menu": {
      if (ctx.tight || (ctx.engine !== "mpv" && ctx.engine !== "exo") || !ctx.onCropMode) return null;
      return (
        <AspectMenu
          mode={ctx.cropMode ?? "fit"}
          onMode={ctx.onCropMode}
          onOpenChange={ctx.setAspectMenuOpen}
        />
      );
    }
    case "anime4k-menu": {
      if (ctx.tight || ctx.engine !== "mpv" || !ctx.onAnime4kMode || !ctx.anime4kAvailable) return null;
      return (
        <Anime4kMenu
          mode={(ctx.anime4kMode as Anime4kChoice) ?? "auto"}
          onMode={ctx.onAnime4kMode}
          onOpenChange={ctx.setAnime4kMenuOpen}
        />
      );
    }
    case "hdr-toggle": {
      if (ctx.tight || ctx.engine !== "mpv") return null;
      return <HdrToggleBigBtn />;
    }
    case "draw-toggle": {
      if (ctx.compact || !ctx.showDraw) return null;
      return (
        <DrawToggle
          active={ctx.drawMode}
          hideOthers={ctx.hideOthersDrawings}
          onToggle={ctx.onToggleDraw}
          onToggleHideOthers={ctx.onToggleHideOthers}
          onClear={ctx.onClearDraw}
        />
      );
    }
    case "screenshot": {
      return (
        <BigButton onClick={ctx.onScreenshot} ariaLabel={t("Screenshot")} tooltip={t("Screenshot")}>
          <Camera size={19} strokeWidth={1.9} />
        </BigButton>
      );
    }
    case "song-id": {
      if (ctx.tight) return null;
      return <IdentifySongButton editing={ctx.editing} />;
    }
    case "pip": {
      if (!ctx.capabilities.pictureInPicture) return null;
      return (
        <BigButton onClick={ctx.onPiP} ariaLabel={t("Picture in Picture")} tooltip={t("Picture in Picture")}>
          <PictureInPicture2 size={19} strokeWidth={1.9} />
        </BigButton>
      );
    }
    case "cast": {
      if (ctx.tight) return null;
      return <CastButton onClick={ctx.onCast} capabilities={ctx.capabilities} />;
    }
    case "luma": {
      if (!ctx.onLuma || ctx.tight) return null;
      return (
        <BigButton onClick={ctx.onLuma} ariaLabel="LUMA" tooltip={`${t("Open LUMA")} · Q`}>
          <ListVideo size={19} strokeWidth={1.9} />
        </BigButton>
      );
    }
    case "fullscreen": {
      return (
        <BigButton
          onClick={ctx.onFullscreen}
          ariaLabel={t("Fullscreen")}
          tooltip={ctx.fullscreen ? t("Exit fullscreen") : t("Fullscreen")}
        >
          {ctx.fullscreen ? (
            <Minimize size={19} strokeWidth={1.9} />
          ) : (
            <Maximize size={19} strokeWidth={1.9} />
          )}
        </BigButton>
      );
    }
    case "window-controls":
      return <WindowControlButtons t={t} />;
  }
}
