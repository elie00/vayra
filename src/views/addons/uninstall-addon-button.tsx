import { Check, Trash2 } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { readActiveStremioAuthKey } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Installed is a status. Only the separately named action can request removal. */
export function UninstallAddonButton({ name, onUninstall, className, showStatus = true, returnFocusRef }: {
  name: string;
  onUninstall: () => void | Promise<void>;
  className?: string;
  showStatus?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState(name);
  const confirmedAccount = useRef<string | null>(null);
  const confirmedAction = useRef(onUninstall);
  const running = useRef(false);
  const request = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    // Explicit focus also gives macOS pointer activation a safe return target.
    event.currentTarget.focus();
    confirmedAccount.current = readActiveStremioAuthKey();
    confirmedAction.current = onUninstall;
    setConfirmedName(name);
    setLinked(!!confirmedAccount.current);
    setError(null);
    setOpen(true);
  };
  const confirm = async () => {
    if (running.current) return;
    if (readActiveStremioAuthKey() !== confirmedAccount.current) {
      setError(t("The Stremio connection changed. Cancel and review the removal scope again."));
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await confirmedAction.current();
      setOpen(false);
    } catch {
      setError(t("The addon could not be fully removed. Check your connection and try again."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return <>
    {showStatus && <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-ink-muted">
      <Check size={14} className="text-accent" aria-hidden="true" />{t("Installed")}
    </span>}
    <button type="button" onClick={request} disabled={busy} aria-label={t("Uninstall {name}", { name })}
      className={className ?? "flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-edge-soft px-3 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"}>
      <Trash2 size={14} aria-hidden="true" />{t("Uninstall")}
    </button>
    {open && <ConfirmationDialog title={t("Uninstall {name}?", { name: confirmedName })} danger
      confirmLabel={busy ? t("Uninstalling") : t("Uninstall")}
      onConfirm={() => void confirm()} onCancel={() => setOpen(false)} busy={busy} error={error} returnFocusRef={returnFocusRef}>
      <p>{linked
        ? t("This removes the addon from VAYRA on this device and from the linked Stremio account, including its other devices.")
        : t("This removes the addon from VAYRA on this device only. No Stremio account is connected.")}</p>
      <p>{t("Its catalogs and sources will no longer be available. Your downloaded files are kept.")}</p>
    </ConfirmationDialog>}
  </>;
}
