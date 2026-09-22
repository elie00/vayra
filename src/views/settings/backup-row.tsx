import { Check, Download, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { applyBackup, BackupRestoreError, backupKeyCount, downloadBackup, parseBackup, type Backup } from "@/lib/backup";
import { getUiLanguage, useT } from "@/lib/i18n";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

export function BackupRow() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [applying, setApplying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoreFailure, setRestoreFailure] = useState<BackupRestoreError | null>(null);
  const applyingRef = useRef(false);
  const [includeLocalActivity, setIncludeLocalActivity] = useState(false);

  const doExport = async () => {
    setError(null);
    setExporting(true);
    try {
      const saved = await downloadBackup({ includeLocalActivity });
      if (saved) {
        setExported(true);
        window.setTimeout(() => setExported(false), 1600);
      }
    } catch {
      setError(t("Could not build the backup file."));
    } finally {
      setExporting(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setRestoreFailure(null);
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseBackup(typeof reader.result === "string" ? reader.result : "");
      if (!res.ok) {
        setError(t(res.error));
        return;
      }
      setPending(res.backup);
    };
    reader.onerror = () => setError(t("Could not read that file."));
    reader.readAsText(file);
  };

  const recover = async () => {
    if (!restoreFailure?.retryRecovery || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      await restoreFailure.retryRecovery();
      setRestoreFailure(null);
      setError(t("Your previous preferences were recovered. You can retry the restore or choose another backup."));
    } catch (failure) {
      setRestoreFailure(failure instanceof BackupRestoreError ? failure : restoreFailure);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };
  const confirmRestore = async () => {
    if (!pending || applyingRef.current) return;
    if (restoreFailure?.retryRecovery) { await recover(); return; }
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    setRestoreFailure(null);
    try {
      await applyBackup(pending);
      window.setTimeout(() => window.location.reload(), 280);
    } catch (failure) {
      setRestoreFailure(failure instanceof BackupRestoreError ? failure : new BackupRestoreError("Restore failed. No reload was performed. Please retry."));
      applyingRef.current = false;
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <input
        ref={fileRef}
        type="file"
        accept=".harbx,.vayrx,application/json,.json"
        onChange={onFile}
        className="hidden"
      />

      <div className="flex flex-col gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-medium text-ink">{t("Export portable preferences")}</span>
          <span className="text-[12.5px] leading-relaxed text-ink-subtle">
            {t("Saves supported playback, language, appearance and navigation preferences. Accounts, keys, profiles, configured extensions, custom code and external links are excluded.")}
          </span>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-ink-muted">
            <input type="checkbox" checked={includeLocalActivity} onChange={(event) => setIncludeLocalActivity(event.target.checked)} className="h-4 w-4 accent-ink" />
            <span>{t("Include private lists, local library references, queue and viewing progress")}</span>
          </label>
          {includeLocalActivity && <p className="text-[12px] leading-relaxed text-ink-subtle">{t("Private activity keeps its profile identifiers. Profiles and media files are not copied; use the same profiles when restoring.")}</p>}
        </div>
        <button
          type="button"
          onClick={doExport}
          disabled={exporting || applying || !!restoreFailure?.retryRecovery}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold transition-all ${
            exported
              ? "bg-accent/15 text-accent"
              : "bg-ink text-canvas hover:scale-[1.02] active:scale-[0.97]"
          }`}
        >
          {exported ? <Check size={14} strokeWidth={2.6} /> : <Download size={14} strokeWidth={2.4} />}
          {exporting ? t("Exporting…") : exported ? t("Saved") : t("Export")}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-medium text-ink">{t("Restore from a backup")}</span>
          <span className="text-[12.5px] leading-relaxed text-ink-subtle">
            {t("Applies the supported saved preferences. Current accounts, profiles, configured extensions and excluded settings stay unchanged, including when importing an older backup.")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={applying || !!restoreFailure?.retryRecovery}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-edge bg-elevated px-3.5 text-[12.5px] font-semibold text-ink transition-all hover:scale-[1.02] hover:border-ink active:scale-[0.97]"
        >
          <Upload size={14} strokeWidth={2.4} />
          {t("Restore")}
        </button>
      </div>

      {error && <p role="alert" className="px-1 text-[12px] text-danger">{error}</p>}
      {!pending && restoreFailure && <div className="space-y-2">
        <p role="alert" className="px-1 text-[12px] text-danger">{t(restoreFailure.message)}</p>
        {restoreFailure.retryRecovery && <button type="button" disabled={applying} className="mac-secondary-button" onClick={() => void recover()}>{t("Retry recovery")}</button>}
      </div>}

      {pending && (
        <RestoreConfirm
          backup={pending}
          applying={applying}
          error={restoreFailure ? t(restoreFailure.message) : error}
          recovering={!!restoreFailure?.retryRecovery}
          onConfirm={confirmRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function RestoreConfirm({
  backup,
  applying,
  onConfirm,
  onCancel,
  error,
  recovering,
}: {
  backup: Backup;
  applying: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
  recovering: boolean;
}) {
  const t = useT();
  const date = new Date(backup.exportedAt);
  const when = Number.isFinite(date.getTime()) ? date.toLocaleString(getUiLanguage()) : t("an unknown date");
  return (
    <ConfirmationDialog
      title={t("Restore this backup?")}
      confirmLabel={applying ? t("Restoring...") : recovering ? t("Retry recovery") : t("Restore and reload")}
      onConfirm={onConfirm}
      onCancel={onCancel}
      busy={applying}
      error={error}
    >
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-muted">
          {t("Applies {n} supported saved entries. Current connections, profiles and configured extensions are kept. Previous values are retained for recovery; VAYRA reloads only after success.", { n: String(backupKeyCount(backup)) })}
        </p>
        <p className="mt-2 text-[12px] text-ink-subtle">
          {t("Saved {when} from VAYRA {app}.", { when, app: backup.app })}
        </p>
        <p className="mt-2 text-[12px] font-medium text-ink-muted">
          {backup.includesLocalActivity ? t("This backup includes private lists or viewing activity. Matching saved collections will be replaced. Local file references do not copy media files.") : t("This backup does not include private activity. Your current lists and viewing progress are unchanged.")}
        </p>
    </ConfirmationDialog>
  );
}
