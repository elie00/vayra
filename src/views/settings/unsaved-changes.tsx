import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { setNavGuard } from "@/lib/nav-guard";
import { useSettings, type Settings } from "@/lib/settings";
import { changedSettingKeys } from "@/lib/settings/diff";
import { useFocusTrap } from "@/lib/use-focus-trap";

/** Settings apply live so previews keep working. This snapshots them on entry
 *  and, when leaving with changes, asks whether to apply them or restore the
 *  snapshot. No floating bar: changes take effect as they are made. */
export function SettingsUnsavedChanges({ active }: { active: boolean }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [snapshot, setSnapshot] = useState<Settings | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{ proceed: () => void } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Start a session when Settings becomes visible; end it when we leave, so a
  // kept-alive Settings view doesn't hold a stale baseline.
  useEffect(() => {
    if (active) setSnapshot((cur) => cur ?? settingsRef.current);
    else {
      setSnapshot(null);
      setPendingLeave(null);
    }
  }, [active]);

  const changed = useMemo(
    () => (snapshot ? changedSettingKeys(settings, snapshot) : []),
    [settings, snapshot],
  );
  const dirty = changed.length > 0;

  useEffect(() => {
    if (!dirty) return;
    setNavGuard((proceed) => {
      setPendingLeave({ proceed });
      return true;
    });
    return () => setNavGuard(null);
  }, [dirty]);

  const leaveSaving = useCallback(() => {
    const go = pendingLeave?.proceed;
    setSnapshot(settingsRef.current);
    setPendingLeave(null);
    setNavGuard(null);
    go?.();
  }, [pendingLeave]);

  const leaveDiscarding = useCallback(() => {
    const go = pendingLeave?.proceed;
    if (snapshot) update(snapshot);
    setPendingLeave(null);
    setNavGuard(null);
    go?.();
  }, [pendingLeave, snapshot, update]);

  if (!active) return null;

  return (
    <>
      {pendingLeave && (
        <ConfirmDialog
          title={t("You have unsaved changes")}
          body={t("Apply your changes before leaving Settings, or discard them?")}
          onCancel={() => setPendingLeave(null)}
          actions={[
            { label: t("Cancel"), onClick: () => setPendingLeave(null), tone: "ghost" },
            { label: t("Discard"), onClick: leaveDiscarding, tone: "danger" },
            { label: t("Apply"), onClick: leaveSaving, tone: "accent" },
          ]}
        />
      )}
    </>
  );
}

type Action = { label: string; onClick: () => void; tone: "ghost" | "danger" | "accent" };

function ConfirmDialog({
  title,
  body,
  onCancel,
  actions,
}: {
  title: string;
  body: string;
  onCancel: () => void;
  actions: Action[];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const tone: Record<Action["tone"], string> = {
    ghost: "text-ink-muted hover:bg-raised hover:text-ink",
    danger: "text-rose-300 hover:bg-rose-500/10",
    accent: "bg-accent text-canvas hover:opacity-90",
  };

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[220] flex items-center justify-center p-4"
    >
      <button type="button" tabIndex={-1} aria-label={actions[0]?.label} onClick={onCancel}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-modal-in relative flex w-[min(92vw,420px)] flex-col gap-3 rounded-2xl border border-edge-soft bg-elevated p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <h2 className="font-display text-[18px] font-medium text-ink">{title}</h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
        <div className="mt-2 flex items-center justify-end gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors max-sm:min-h-12 max-sm:text-[15px] ${tone[a.tone]}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
