import { useEffect, useRef, useState } from "react";
import { HarborLoader } from "@/components/harbor-loader";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { isLocalUrl } from "@/lib/player/local-url";
import type { PlayerSrc } from "@/lib/view";
import { Topbar } from "@/chrome/topbar";
import { useT } from "@/lib/i18n";
import { LoaderLogoOrText } from "./loader-logo-or-text";
import { readinessScore, type EngineStats } from "@/lib/torrent/engine-stats";
import { isBundledEngineUrl, isLocalEngineUrl } from "@/lib/stremio-server";
import { StreamLoadingBar } from "./stream-loading-bar";

function fmtSpeed(bps: number): string {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return "warming up";
}

export function CinematicPlayerLoader({
  src,
  snap,
  forceShow,
  onCancel,
  engineStats,
  onShowingChange,
}: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  forceShow?: boolean;
  onCancel: () => void;
  engineStats?: EngineStats | null;
  onShowingChange?: (showing: boolean) => void;
}) {
  const t = useT();
  const isLocal = isLocalUrl(src.url);
  const isInfoHash =
    (isBundledEngineUrl(src.url) || isLocalEngineUrl(src.url)) && !src.url.includes("/hlsv2/");
  const enginePeers = engineStats ? (engineStats.unchoked > 0 ? engineStats.unchoked : engineStats.peers) : 0;
  const engineSpeed = engineStats?.downloadSpeed ?? 0;
  const showEngineActivity = isInfoHash && !!engineStats && (enginePeers > 0 || engineSpeed > 0);
  const streamBytes = src.streamRef?.size ?? engineStats?.streamLen ?? null;
  const ready = isInfoHash ? readinessScore(engineStats ?? null, true) : 0;
  const heavyForP2p = isInfoHash && streamBytes != null && streamBytes > 20 * 1024 ** 3;
  const everPlayedRef = useRef(false);
  const hasProgress = usePlaybackFlag(() => getPlaybackPosition() > 0.3);
  if (snap.durationSec > 0 && hasProgress) {
    everPlayedRef.current = true;
  }
  const sessionKey = `${src.meta.id}::${src.episode?.season ?? ""}:${src.episode?.episode ?? ""}`;
  const lastSessionRef = useRef(sessionKey);
  if (lastSessionRef.current !== sessionKey) {
    lastSessionRef.current = sessionKey;
    everPlayedRef.current = false;
  }
  const showing =
    forceShow ||
    (!everPlayedRef.current && snap.errorCode == null && snap.status !== "ended");
  const done = !showing && snap.errorCode == null;
  const [mounted, setMounted] = useState(showing);
  useEffect(() => {
    onShowingChange?.(showing);
  }, [showing, onShowingChange]);
  useEffect(() => () => onShowingChange?.(false), [onShowingChange]);
  useEffect(() => {
    if (showing) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(timer);
  }, [showing]);
  if (!mounted) return null;
  const backdrop = src.episode?.still || src.meta.background || src.meta.poster;
  return (
    <div
      data-tauri-drag-region
      className={`absolute inset-0 z-[80] overflow-hidden bg-black transition-opacity duration-300 ${
        showing ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      <Topbar connecting />
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[28px] saturate-150"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/85" />
      <div
        data-tauri-drag-region
        className="relative flex h-full flex-col items-center justify-center gap-7 px-8 text-center"
      >
        <LoaderLogoOrText
          logo={src.meta.logo ?? null}
          fallbackText={src.meta.name ?? src.title}
        />
        {src.episode && (
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.32em] text-white/70">
            S{src.episode.imdbSeason ?? src.episode.season} · E
            {String(src.episode.imdbEpisode ?? src.episode.episode).padStart(2, "0")}
            {src.episode.name ? ` · ${src.episode.name}` : ""}
          </p>
        )}
        {isInfoHash ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-3">
            <StreamLoadingBar key={src.url} ready={ready} done={done} />
            <p className="text-[12.5px] font-medium uppercase tracking-[0.18em] text-white/70">
              {snap.buffering ? t("Buffering") : t("Preparing stream")}
            </p>
          </div>
        ) : (
          <HarborLoader size="md" caption={isLocal ? t("Loading") : t("Connecting")} />
        )}
        {showEngineActivity && (
          <p className="text-[12.5px] font-medium tracking-wide text-white/50 tabular-nums">
            {enginePeers} {enginePeers === 1 ? t("peer") : t("peers")} · {fmtSpeed(engineSpeed)}
          </p>
        )}
        {heavyForP2p && (
          <p className="max-w-md text-[12.5px] leading-relaxed text-amber-300/85">
            {t("Heads up: this is a large file for peer-to-peer streaming, so it can take a while to start. A 1080p source or a debrid service will load faster.")}
          </p>
        )}
      </div>
      <button
        onClick={onCancel}
        className="absolute bottom-10 left-1/2 z-10 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/45 px-6 text-[13.5px] font-medium text-white/75 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60 hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {t("Cancel")}
      </button>
    </div>
  );
}
