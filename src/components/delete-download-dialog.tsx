import { useState, type RefObject } from "react";
import { ConfirmationDialog } from "./confirmation-dialog";
import { removeDownload, type DownloadItem } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";

export function DeleteDownloadDialog({ item, onClose, returnFocusRef }: { item: DownloadItem; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const removed = await removeDownload(item.id);
    if (removed) onClose();
    else { setBusy(false); setFailed(true); }
  };
  return <ConfirmationDialog title={t("Delete this download?")} confirmLabel={t(busy ? "Deleting file…" : "Delete download and file")}
    onConfirm={() => void confirm()} onCancel={onClose} busy={busy} danger returnFocusRef={returnFocusRef}
    error={failed ? t("The file could not be fully deleted. It remains in Downloads. Check folder permissions, then try again.") : null}>
    <p className="font-medium text-ink">{item.title}{item.subtitle ? ` · ${item.subtitle}` : ""}</p>
    <p>{t("The video file and any partial download will be permanently deleted from this Mac. This cannot be undone.")}</p>
    <p className="break-all text-xs">{item.path}</p>
  </ConfirmationDialog>;
}
