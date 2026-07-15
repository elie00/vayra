import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Diagnostics } from "@/lib/bug-report";
import { useT } from "@/lib/i18n";

export function DiagnosticsCard({
  diag,
  included,
  onIncludedChange,
}: {
  diag: Diagnostics | null;
  included: boolean;
  onIncludedChange: (included: boolean) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!diag) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-edge-soft/55 bg-canvas/30 px-4 py-3 text-[12px] text-ink-subtle">
        {t("Loading environment details…")}
      </div>
    );
  }
  const compact = `VAYRA ${diag.appVersion} · ${diag.channel} · ${diag.recentErrors.length} ${t("recent errors")}`;
  return (
    <div className="rounded-xl border border-edge-soft/55 bg-canvas/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-elevated text-ink-muted">
          <ShieldCheck size={14} strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[12px] font-semibold text-ink">{t("Optional privacy-safe diagnostic")}</span>
          <span className="truncate text-[11.5px] text-ink-subtle">{compact}</span>
        </div>
        <span className="ms-auto text-ink-subtle">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-edge-soft/55 px-4 py-3">
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink-muted">
            {t("Nothing is included unless you opt in. It contains only the app version, beta channel and redacted error messages.")}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] font-mono text-ink-muted">
            <Pair k={t("App")} v={diag.appVersion} />
            <Pair k={t("Channel")} v={diag.channel} />
            <Pair k={t("Recent errors")} v={String(diag.recentErrors.length)} />
          </div>
          <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-edge-soft px-3 py-2.5">
            <input type="checkbox" checked={included} onChange={(event) => onIncludedChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
            <span className="text-[11.5px] leading-relaxed text-ink-muted">{t("Include this diagnostic with my report.")}</span>
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">{t("Never included: content, source, URL, addon, info-hash, progress, library, local path, IP address, device details or Stremio session.")}</p>
        </div>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  const t = useT();
  return (
    <>
      <span className="text-ink-subtle">{k}</span>
      <span className="truncate text-ink">{v || t("n/a")}</span>
    </>
  );
}
