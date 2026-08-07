import { X } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import type { SeasonDownloadProgress } from "@/lib/download/season-download";
import { useT } from "@/lib/i18n";

export function SeasonDownloadOverlay({
  meta,
  progress,
  onCancel,
}: {
  meta: Meta;
  progress: SeasonDownloadProgress;
  onCancel: () => void;
}) {
  const t = useT();
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const cur = progress.current;
  return (
    <main className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-canvas px-8">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[20px] font-semibold tracking-tight text-ink">
            {t("Preparing season download")}
          </span>
          <span className="text-[13.5px] text-ink-muted">
            {cur
              ? `${meta.name ?? ""} · S${cur.season} · E${String(cur.episode).padStart(2, "0")}`
              : meta.name}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 text-[12.5px] tabular-nums text-ink-muted">
          <span>
            {progress.done} / {progress.total}
          </span>
          {progress.queued > 0 && (
            <span className="text-ink-subtle">· {t("{n} queued", { n: progress.queued })}</span>
          )}
          {progress.skipped > 0 && (
            <span className="text-ink-subtle">· {t("{n} already saved", { n: progress.skipped })}</span>
          )}
          {progress.failed > 0 && (
            <span className="text-danger">· {t("{n} not in this pack", { n: progress.failed })}</span>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-fit items-center gap-2 rounded-full border border-edge-soft px-4 text-[13px] font-medium text-ink-muted transition-colors hover:bg-elevated/60 hover:text-ink"
        >
          <X size={15} strokeWidth={2.2} />
          {t("Stop")}
        </button>
      </div>
    </main>
  );
}
