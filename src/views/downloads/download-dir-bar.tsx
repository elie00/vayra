import { downloadDir as systemDownloadDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { ToggleRow } from "@/views/settings/shared";
import { invoke } from "@tauri-apps/api/core";
import { isMacDesktop } from "@/lib/platform";
import { getUiLanguage } from "@/lib/i18n";
import { DownloadPolicyControls } from "./policy-controls";

export function DownloadDirBar() {
  const t = useT();
  const { settings, update } = useSettings();
  const [systemDefault, setSystemDefault] = useState("");

  useEffect(() => {
    let cancelled = false;
    systemDownloadDir()
      .then((d) => {
        if (!cancelled) setSystemDefault(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const current = settings.downloadDir || systemDefault;
  const isCustom = !!settings.downloadDir;
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  useEffect(() => {
    if (!isMacDesktop() || !current) return;
    let alive = true;
    setFreeBytes(null);
    const refresh = () => { void invoke<number>("download_available_space", { path: current }).then((n) => { if (alive) setFreeBytes(n); }).catch(() => { if (alive) setFreeBytes(null); }); };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [current]);

  const pick = async () => {
    try {
      const picked = await open({ directory: true, defaultPath: current || undefined });
      if (typeof picked === "string") update({ downloadDir: picked });
    } catch {
      return;
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl border border-edge-soft bg-elevated/40 px-4 py-3">
        <FolderOpen size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {isCustom ? t("Saving to") : t("Saving to system default")}
          </span>
          <button
            type="button"
            onClick={() => current && void revealItemInDir(current)}
            title={current ? t("{path} (open folder)", { path: current }) : undefined}
            className="truncate text-start font-mono text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            {current || t("Detecting...")}
          </button>
        </div>
        <button
          type="button"
          onClick={pick}
          className="shrink-0 rounded-lg border border-edge-soft px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
        >
          {t("Change")}
        </button>
        {isCustom && (
          <button
            type="button"
            onClick={() => update({ downloadDir: "" })}
            aria-label={t("Reset to default folder")}
            title={t("Reset to default")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <RotateCcw size={15} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <ToggleRow
        label={t("Organize downloads into folders")}
        note={t("Create a folder by movie or series name")}
        value={settings.downloadCreateFolders}
        onChange={(v) => update({ downloadCreateFolders: v })}
      />
      {isMacDesktop() && <p role="status" className="text-[13px] tabular-nums text-ink-muted">{freeBytes == null ? t("Available space could not be determined") : t("{size} GB available", { size: (freeBytes / 1024 ** 3).toLocaleString(getUiLanguage(), { maximumFractionDigits: 1 }) })}</p>}
      {isMacDesktop() && <DownloadPolicyControls />}
    </div>
  );
}
