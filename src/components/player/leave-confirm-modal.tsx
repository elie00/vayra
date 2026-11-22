import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  closeLeaveConfirm,
  getLeaveConfirm,
  subscribeLeaveConfirm,
} from "@/lib/player/leave-confirm";

export function LeaveConfirmModal() {
  const t = useT();
  const state = useSyncExternalStore(subscribeLeaveConfirm, getLeaveConfirm);
  const [remember, setRemember] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepWatchingRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dialogRef, state.open);

  useEffect(() => {
    if (state.open) {
      setRemember(false);
      keepWatchingRef.current?.focus();
    }
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeLeaveConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.open]);

  if (!state.open) return null;

  const leave = () => {
    const fn = state.onConfirm;
    closeLeaveConfirm();
    fn?.(remember);
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Keep watching")}
        onClick={closeLeaveConfirm}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-confirm-title"
        aria-describedby="leave-confirm-desc"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-edge bg-surface p-7 text-center shadow-2xl"
      >
        <h2 id="leave-confirm-title" className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {t("Leave playback?")}
        </h2>
        <p id="leave-confirm-desc" className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
          {t("We'll save your spot so you can pick up right where you left off.")}
        </p>
        <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-2.5 text-[14px] text-ink-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[18px] w-[18px] cursor-pointer"
          />
          {t("Don't ask me again")}
        </label>
        <div className="mt-6 flex gap-3">
          <button
            ref={keepWatchingRef}
            type="button"
            onClick={closeLeaveConfirm}
            className="h-12 flex-1 rounded-xl bg-elevated text-[15px] font-semibold text-ink transition-colors hover:bg-raised"
          >
            {t("Keep watching")}
          </button>
          <button
            type="button"
            onClick={leave}
            className="h-12 flex-1 rounded-xl bg-ink text-[15px] font-semibold text-canvas transition-transform hover:scale-[1.02]"
          >
            {t("Leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
