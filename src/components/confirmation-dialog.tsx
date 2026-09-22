import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";

/** Safe default for irreversible actions: cancellation receives initial focus. */
export function ConfirmationDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, error, danger = false, returnFocusRef }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
  danger?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const current = useRef({ busy, onCancel });
  current.current = { busy, onCancel };
  useFocusTrap(dialogRef, true, returnFocusRef);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!current.current.busy) current.current.onCancel();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  // Disabling the focused button must not leave focus behind the dialog.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <button type="button" tabIndex={-1} aria-label={t("Cancel")} disabled={busy} onClick={onCancel}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
        aria-busy={busy} tabIndex={-1}
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-edge-soft bg-elevated p-5 text-ink shadow-2xl">
        <h2 id={titleId} className="font-display text-lg font-medium">{title}</h2>
        <div id={descriptionId} className="mt-3 space-y-2 break-words text-sm leading-relaxed text-ink-muted">{children}</div>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="mac-secondary-button disabled:opacity-50">{t("Cancel")}</button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${danger ? "bg-danger/15 text-danger hover:bg-danger/25" : "bg-accent text-canvas hover:opacity-90"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
