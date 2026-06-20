import { Share2 } from "lucide-react";
import type { EngineStats } from "@/lib/torrent/engine-stats";

function fmtSpeed(bps: number): string {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return "0 KB/s";
}

export function P2pStatusChip({
  stats,
  visible,
}: {
  stats: EngineStats | null | undefined;
  visible: boolean;
}) {
  if (!visible || !stats) return null;
  const peers = stats.unchoked > 0 ? stats.unchoked : stats.peers;
  const pct = stats.streamLen ? Math.min(100, Math.round((stats.downloaded / stats.streamLen) * 100)) : null;

  return (
    <div
      className="pointer-events-none absolute bottom-7 left-7 z-30 flex items-center gap-2.5 rounded-full border border-white/12 bg-black/80 py-1.5 ps-2.5 pe-3.5 shadow-[0_12px_32px_-14px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl animate-in fade-in duration-300"
      role="status"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8">
        <Share2 size={11} strokeWidth={2.4} className="text-white/85" />
      </span>
      <div className="flex items-center gap-2 text-[11.5px] font-semibold leading-none tabular-nums text-white/80">
        <span>{peers} {peers === 1 ? "peer" : "peers"}</span>
        <span className="text-white/25">|</span>
        <span>{fmtSpeed(stats.downloadSpeed)}</span>
        {pct != null && (
          <>
            <span className="text-white/25">|</span>
            <span>{pct}%</span>
          </>
        )}
      </div>
    </div>
  );
}
