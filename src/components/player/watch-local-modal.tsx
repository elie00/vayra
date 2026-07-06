import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { HardDrive, Wifi } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  closeWatchLocalConfirm,
  getWatchLocalConfirm,
  subscribeWatchLocalConfirm,
  type WatchLocalChoice,
} from "@/lib/player/watch-local-confirm";

// The "Watch locally or stream?" prompt. Mounted once at the app root; opened
// imperatively from the play chain. The caller's onChoose applies the remember flag.
export function WatchLocalModal() {
  const t = useT();
  const state = useSyncExternalStore(subscribeWatchLocalConfirm, getWatchLocalConfirm);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (state.open) setRemember(false);
  }, [state.open]);

  const choose = (choice: WatchLocalChoice) => {
    const fn = state.onChoose;
    closeWatchLocalConfirm();
    fn?.(choice, remember);
  };

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeWatchLocalConfirm();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose("local");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.onChoose, remember]);

  if (!state.open) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[210] flex items-center justify-center bg-black/72 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWatchLocalConfirm();
      }}
    >
      <div className="mx-4 flex w-full max-w-[440px] flex-col gap-5 rounded-[24px] border border-edge-soft bg-elevated/95 px-8 py-8 shadow-[0_30px_80px_-25px_rgba(0,0,0,0.85)] animate-in zoom-in-95 fade-in duration-200">
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-[19px] font-medium tracking-tight text-ink">{t("This is in your local library")}</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {state.subtitle ? `${state.title} · ${state.subtitle}` : state.title}
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            autoFocus
            onClick={() => choose("local")}
            className="flex h-12 items-center justify-center gap-2.5 rounded-full bg-ink text-[14px] font-semibold text-canvas transition-transform hover:scale-[1.02]"
          >
            <HardDrive size={16} strokeWidth={2.2} />
            {t("Watch my local copy")}
          </button>
          <button
            type="button"
            onClick={() => choose("stream")}
            className="flex h-12 items-center justify-center gap-2.5 rounded-full bg-canvas/50 text-[14px] font-semibold text-ink ring-1 ring-edge-soft transition-colors hover:bg-canvas/70"
          >
            <Wifi size={16} strokeWidth={2.2} />
            {t("Stream / addons")}
          </button>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2.5 text-[13px] text-ink-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[16px] w-[16px] cursor-pointer"
          />
          {t("Remember my choice")}
        </label>
      </div>
    </div>,
    document.body,
  );
}
