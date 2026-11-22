import { Check, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { setNavGuard } from "@/lib/nav-guard";
import { useSettings, type Settings } from "@/lib/settings";
import { changedSettingKeys } from "@/lib/settings/diff";

/** Settings save live as you edit them. Snapshots the session baseline on entry
 *  and shows a non-blocking saved confirmation with a one-click Undo action,
 *  without ever blocking navigation out of Settings. */
export function SettingsUnsavedChanges({ active }: { active: boolean }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [snapshot, setSnapshot] = useState<Settings | null>(null);
  const [visible, setVisible] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    setNavGuard(null);
    if (active) {
      setSnapshot((cur) => cur ?? settingsRef.current);
    } else {
      setSnapshot(null);
      setVisible(false);
    }
  }, [active]);

  const changed = useMemo(
    () => (snapshot ? changedSettingKeys(settings, snapshot) : []),
    [settings, snapshot],
  );
  const changeSignature = useMemo(
    () => (changed.length > 0 ? changed.map((k) => `${k}:${JSON.stringify(settings[k as keyof Settings])}`).join("|") : ""),
    [changed, settings],
  );

  useEffect(() => {
    if (!active || !changeSignature) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(id);
  }, [active, changeSignature]);

  const undoSession = useCallback(() => {
    if (!snapshot) return;
    update(snapshot);
    setVisible(false);
  }, [snapshot, update]);

  if (!active || !visible || changed.length === 0) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed bottom-6 end-6 z-[180] flex items-center gap-3 rounded-full border border-edge-soft bg-elevated/95 ps-4 pe-2 py-2 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.65)] backdrop-blur-xl max-sm:bottom-24 max-sm:end-4"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="text-[13px] font-medium text-ink">{t("Changes saved")}</span>
      <button
        type="button"
        onClick={undoSession}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-ink hover:text-canvas"
      >
        <RotateCcw size={12} strokeWidth={2.2} />
        {t("Undo")}
      </button>
    </div>,
    document.body,
  );
}
