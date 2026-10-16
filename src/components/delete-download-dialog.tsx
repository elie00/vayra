import { useRef, useState, type RefObject } from "react";
import { ConfirmationDialog } from "./confirmation-dialog";
import { removeDownload, type DownloadItem } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";

/** Confirm deleting one download, or several picked together (episodes of a show). */
export function DeleteDownloadDialog({ items, onClose, returnFocusRef }: { items: DownloadItem[]; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const single = items.length === 1 ? items[0] : null;
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const removed = await Promise.all(items.map((item) => removeDownload(item.id)));
      if (removed.every(Boolean)) onClose();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const confirmLabel = busy
    ? t("Deleting file…")
    : single
      ? t("Delete download and file")
      : t("Delete {n} downloads and files", { n: items.length });
  return <ConfirmationDialog title={single ? t("Delete this download?") : t("Delete {n} downloads?", { n: items.length })} confirmLabel={confirmLabel}
    onConfirm={() => void confirm()} onCancel={onClose} busy={busy} danger returnFocusRef={returnFocusRef}
    error={failed ? t("The file could not be fully deleted. It remains in Downloads. Check folder permissions, then try again.") : null}>
    {single ? (
      <>
        <p className="font-medium text-ink">{single.title}{single.subtitle ? ` · ${single.subtitle}` : ""}</p>
        <p>{t("The video file and any partial download will be permanently deleted from this computer. This cannot be undone.")}</p>
        <p className="break-all text-xs">{single.path}</p>
      </>
    ) : (
      <>
        <p className="font-medium text-ink">{items[0]?.title}</p>
        <ul className="max-h-40 list-disc overflow-y-auto ps-5">
          {items.map((item) => <li key={item.id}>{item.subtitle ?? item.title}</li>)}
        </ul>
        <p>{t("These video files and any partial downloads will be permanently deleted. This cannot be undone.")}</p>
      </>
    )}
  </ConfirmationDialog>;
}
