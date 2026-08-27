import { Check, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  subscribeAppFeedback,
  type AppFeedback,
} from "@/lib/app-feedback";
import { useT } from "@/lib/i18n";

export function AppFeedbackHost() {
  const [feedback, setFeedback] = useState<AppFeedback | null>(null);
  const timerRef = useRef<number | null>(null);
  const t = useT();

  useEffect(
    () =>
      subscribeAppFeedback((next) => {
        setFeedback(next);
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(
          () => setFeedback(null),
          next.durationMs ?? (next.kind === "error" ? 6000 : 3200),
        );
      }),
    [],
  );

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!feedback) return null;
  const error = feedback.kind === "error";
  const success = feedback.kind === "success";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-4 bottom-6 z-[240] flex justify-center"
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div
        className={`pointer-events-auto flex max-w-[min(34rem,calc(100vw-2rem))] items-center gap-2.5 rounded-2xl border bg-elevated/95 p-1.5 ps-2 shadow-[0_20px_55px_-22px_rgba(0,0,0,0.72)] backdrop-blur-xl animate-popover-in ${
          error ? "border-danger/45" : "border-edge-soft"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            error
              ? "bg-danger/15 text-danger"
              : success
                ? "bg-accent/15 text-accent"
                : "bg-elevated text-ink-muted"
          }`}
        >
          {error ? (
            <X size={14} strokeWidth={2.5} />
          ) : success ? (
            <Check size={14} strokeWidth={2.5} />
          ) : (
            <Info size={14} strokeWidth={2.3} />
          )}
        </span>
        <span className="min-w-0 flex-1 text-pretty px-0.5 text-[13px] font-medium leading-5 text-ink">
          {feedback.text}
        </span>
        <button
          type="button"
          onClick={() => setFeedback(null)}
          aria-label={t("common.close")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
