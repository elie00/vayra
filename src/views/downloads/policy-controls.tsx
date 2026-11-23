import { configureDownloads, useDownloadPolicy, useDownloads } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";

export function DownloadPolicyControls() {
  const t = useT();
  const policy = useDownloadPolicy();
  const stored = useDownloads().reduce((sum, d) => sum + d.receivedBytes, 0);
  return (
    <section aria-label={t("Download limits")} className="rounded-xl border border-edge-soft/65 bg-canvas/45 p-4">
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-3 text-[13px] font-medium text-ink-muted">
          {t("Simultaneous downloads")}
          <select
            className="min-h-10 rounded-xl border border-edge-soft/80 bg-elevated px-3 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors hover:border-edge"
            value={policy.concurrent}
            onChange={(e) => configureDownloads({ concurrent: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 text-[13px] font-medium text-ink-muted">
          {t("Download storage budget")}
          <select
            className="min-h-10 rounded-xl border border-edge-soft/80 bg-elevated px-3 text-[13px] font-medium tabular-nums text-ink outline-none transition-colors hover:border-edge"
            value={policy.quotaGiB}
            onChange={(e) => configureDownloads({ quotaGiB: Number(e.target.value) })}
          >
            {[...new Set([0, 25, 50, 100, 250, 500, 1000, policy.quotaGiB])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n ? t("{n} GB", { n }) : t("Unlimited")}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
        {t("The budget includes completed and partial downloads managed by VAYRA. No file is deleted automatically.")}
      </p>
      {policy.quotaGiB > 0 && stored >= policy.quotaGiB * 1024 ** 3 && (
        <p role="status" className="mt-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          {t("Storage budget reached. Increase it or remove a download before resuming.")}
        </p>
      )}
    </section>
  );
}
