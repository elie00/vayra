import { Anime4kIndicator } from "@/components/player/anime4k-indicator";
import { SvpIndicator } from "@/components/player/svp-indicator";
import { StatsOverlay } from "@/components/player/stats-overlay";
import { SubStyleBar } from "@/components/player/sub-style-bar";
import { SubSyncBar } from "@/components/player/sub-sync-bar";
import { SubtitleOverlay } from "@/components/player/subtitle-overlay";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { useT } from "@/lib/i18n";

export function StageOverlays({
  snap,
  engine,
  pipMode,
  subShowInPip,
  subAssNative,
  showStats,
  holdSpeedActive,
  videoFillPill,
  subDropToast,
  onSubDelay,
  onEnterSync,
  chromeVisible,
}: {
  snap: PlayerSnapshot;
  engine: "html5" | "mpv";
  pipMode: boolean;
  subShowInPip: boolean;
  subAssNative: boolean;
  showStats: boolean;
  holdSpeedActive: boolean;
  videoFillPill: string | null;
  subDropToast: string | null;
  onSubDelay: (sec: number) => void;
  onEnterSync?: () => void;
  chromeVisible: boolean;
}) {
  const t = useT();
  return (
    <>
      {(!pipMode || subShowInPip) && !subAssNative && (
        <SubtitleOverlay text={snap.subText} startSec={snap.subStartSec} scale={pipMode ? 0.45 : 1} />
      )}
      {showStats && !pipMode && <StatsOverlay snap={snap} engine={engine} />}
      {!pipMode && <Anime4kIndicator engine={engine} chromeVisible={chromeVisible} />}
      {!pipMode && <SvpIndicator engine={engine} chromeVisible={chromeVisible} />}
      {holdSpeedActive && !pipMode && (
        <div className="pointer-events-none absolute left-1/2 top-8 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-canvas/85 px-3.5 py-1.5 text-[13px] font-semibold text-ink backdrop-blur-md">
          {snap.rate}x
          <span className="font-normal text-ink-muted">{t("speed")}</span>
        </div>
      )}
      {videoFillPill && !holdSpeedActive && !pipMode && (
        <div className="pointer-events-none absolute left-1/2 top-8 z-30 -translate-x-1/2 rounded-full bg-canvas/85 px-3.5 py-1.5 text-[13px] font-semibold text-ink backdrop-blur-md">
          {videoFillPill}
        </div>
      )}
      {subDropToast && !pipMode && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full bg-canvas/90 px-4 py-2 text-[13px] font-medium text-ink backdrop-blur-md">
          {subDropToast}
        </div>
      )}
      {!pipMode && <SubStyleBar />}
      {!pipMode && (
        <SubSyncBar
          delaySec={snap.subDelaySec}
          onDelay={onSubDelay}
          onEnterSync={onEnterSync}
          syncAvailable={snap.subtitleTracks.some((t) => t.selected && (t.external || !!(t as { url?: string }).url))}
        />
      )}
    </>
  );
}
