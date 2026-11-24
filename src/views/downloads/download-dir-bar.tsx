import { downloadDir as systemDownloadDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ChevronDown, FolderOpen, HardDrive, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { ToggleRow } from "@/views/settings/shared";
import { invoke } from "@tauri-apps/api/core";
import { hasNativeDesktopUx } from "@/lib/platform";
import { getUiLanguage } from "@/lib/i18n";
import { DownloadPolicyControls } from "./policy-controls";

export function DownloadDirBar() {
  const t = useT();
  const { settings, update } = useSettings();
  const [systemDefault, setSystemDefault] = useState("");
  const [defaultFailed, setDefaultFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const choosingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    systemDownloadDir()
      .then((d) => {
        if (!cancelled) { setSystemDefault(d); setDefaultFailed(!d); }
      })
      .catch(() => { if (!cancelled) setDefaultFailed(true); });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = settings.downloadDir || systemDefault;
  const isCustom = !!settings.downloadDir;
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [spaceLoading, setSpaceLoading] = useState(false);
  useEffect(() => {
    if (!hasNativeDesktopUx() || !current) { setFreeBytes(null); setSpaceLoading(false); return; }
    let alive = true;
    setFreeBytes(null);
    setSpaceLoading(true);
    const refresh = () => {
      void invoke<number>("download_available_space", { path: current })
        .then((n) => { if (alive) setFreeBytes(Number.isFinite(n) && n >= 0 ? n : null); })
        .catch(() => { if (alive) setFreeBytes(null); })
        .finally(() => { if (alive) setSpaceLoading(false); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [current]);

  const pick = async () => {
    if (choosingRef.current) return;
    choosingRef.current = true;
    setChoosing(true);
    setActionError(null);
    try {
      const picked = await open({ directory: true, defaultPath: current || undefined });
      if (typeof picked === "string") update({ downloadDir: picked });
    } catch {
      setActionError(t("The folder chooser could not be opened. Try again."));
    } finally {
      choosingRef.current = false;
      setChoosing(false);
    }
  };

  const reveal = async () => {
    if (!current) return;
    setActionError(null);
    try { await revealItemInDir(current); }
    catch { setActionError(t("The folder could not be opened. Your download has not been changed. Try again from Downloads.")); }
  };

  return (
    <section className="vayra-surface flex flex-col gap-3 p-3.5 sm:px-4 sm:py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated/80 text-ink-subtle">
          <FolderOpen size={16} strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-ink-subtle">
              {isCustom ? t("Saving to") : t("Saving to system default")}
            </span>
            {hasNativeDesktopUx() && current && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] tabular-nums text-ink-subtle">
                <HardDrive size={12} strokeWidth={2} aria-hidden="true" />
                <span role="status">
                  {spaceLoading
                    ? t("Loading…")
                    : freeBytes == null
                      ? t("Available space could not be determined")
                      : t("{size} GB available", {
                          size: (freeBytes / 1024 ** 3).toLocaleString(getUiLanguage(), { maximumFractionDigits: 1 }),
                        })}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!current}
            onClick={() => void reveal()}
            title={current ? t("{path} (open folder)", { path: current }) : undefined}
            className="truncate text-start font-mono text-[12.5px] text-ink-muted transition-colors hover:text-ink disabled:cursor-default"
          >
            {current || t(defaultFailed ? "Download folder is unavailable. Choose a folder." : "Detecting...")}
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={pick}
            disabled={choosing}
            aria-busy={choosing}
            className="mac-secondary-button"
          >
            {t(choosing ? "Loading…" : "Change")}
          </button>
          {isCustom && (
            <button
              type="button"
              disabled={choosing}
              onClick={() => { setActionError(null); update({ downloadDir: "" }); }}
              aria-label={t("Reset to default folder")}
              title={t("Reset to default")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-surface text-ink-subtle transition-colors hover:border-edge hover:bg-elevated hover:text-ink"
            >
              <RotateCcw size={15} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((open) => !open)}
            className="mac-secondary-button"
          >
            <SlidersHorizontal size={14} strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">{t("Storage options")}</span>
            <ChevronDown
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className={`text-ink-subtle transition-transform duration-150 motion-reduce:transition-none ${optionsOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {actionError && <p role="alert" className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{actionError}</p>}
      {!current && defaultFailed && <p role="alert" className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{t("Download folder is unavailable. Choose a folder.")}</p>}

      {optionsOpen && (
        <div className="flex flex-col gap-3 border-t border-edge-soft/60 pt-3.5">
          <ToggleRow
            label={t("Organize downloads into folders")}
            note={t("Create a folder by movie or series name")}
            value={settings.downloadCreateFolders}
            onChange={(v) => update({ downloadCreateFolders: v })}
          />
          {hasNativeDesktopUx() && <DownloadPolicyControls />}
        </div>
      )}
    </section>
  );
}
