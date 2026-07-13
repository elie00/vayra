import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Diagnostics } from "@/lib/bug-report";
import { useT } from "@/lib/i18n";

export function DiagnosticsCard({ diag }: { diag: Diagnostics | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!diag) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-edge-soft/55 bg-canvas/30 px-4 py-3 text-[12px] text-ink-subtle">
        {t("Loading environment details…")}
      </div>
    );
  }
  const compact = `VAYRA ${diag.appVersion} · ${diag.os}${diag.osVersion ? ` ${diag.osVersion}` : ""} · ${diag.viewport} · ${diag.locale}`;
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
          <span className="text-[12px] font-semibold text-ink">{t("What gets sent")}</span>
          <span className="truncate text-[11.5px] text-ink-subtle">{compact}</span>
        </div>
        <span className="ms-auto text-ink-subtle">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-edge-soft/55 px-4 py-3">
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink-muted">
            {t("Auto-included. No keys, no library, no URLs. Just structural flags so reproductions go faster.")}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] font-mono text-ink-muted">
            <Pair k={t("App")} v={diag.appVersion} />
            <Pair k="OS" v={`${diag.os} ${diag.osVersion}`} />
            <Pair k={t("Viewport")} v={diag.viewport} />
            <Pair k={t("Locale")} v={diag.locale} />
            <Pair k={t("Player")} v={diag.flags.playerEngine} />
            <Pair k={t("Region")} v={diag.flags.region} />
            <Pair k={t("TMDB key")} v={diag.flags.hasTmdb ? t("yes") : t("no")} />
            <Pair k={t("RPDB key")} v={diag.flags.hasRpdb ? t("yes") : t("no")} />
            <Pair k="Trakt" v={diag.flags.hasTrakt ? t("yes") : t("no")} />
            <Pair k="Stremio" v={diag.flags.hasStremio ? t("signed in") : t("guest")} />
            <Pair k={t("Debrid keys")} v={String(diag.flags.debridCount)} />
            <Pair k={t("Addons")} v={String(diag.flags.addonCount)} />
            <Pair k={t("IPTV lists")} v={String(diag.flags.iptvCount)} />
            <Pair k={t("Recent errors")} v={String(diag.recentErrors.length)} />
          </div>
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
