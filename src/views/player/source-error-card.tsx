import { ArrowLeft, ListVideo, RotateCcw, ServerCrash, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { SourceError } from "./hooks/use-auto-retry";

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  410: "Gone",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

function describe(status: number): { title: string; detail: string; offline: boolean } {
  if (status === 0)
    return {
      title: "This source didn't respond",
      detail: "The provider's server could not be reached. It may be offline, or you have no connection.",
      offline: true,
    };
  if (status >= 500)
    return {
      title: "This source is down",
      detail: "The provider's server returned an error. Nothing on VAYRA's side can fix this. Pick another source.",
      offline: false,
    };
  if (status >= 400)
    return {
      title: "This source rejected the stream",
      detail: "The provider refused the request. The link is likely expired, region locked, or out of quota.",
      offline: false,
    };
  return {
    title: "VAYRA couldn't play this source",
    detail: "The source responded but the stream would not open. Try a different one.",
    offline: false,
  };
}

export function SourceErrorCard({
  error,
  onChoose,
  onRetry,
  onBack,
}: {
  error: SourceError;
  onChoose: () => void;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    if (!onBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onBack]);

  const info = describe(error.status);
  const codeLabel = error.status === 0 ? t("No response") : `HTTP ${error.status}`;
  const statusName = STATUS_TEXT[error.status];

  return (
    <div className="animate-fade-in absolute inset-0 z-40 flex items-center justify-center bg-canvas/85 p-6 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="source-error-title"
        tabIndex={-1}
        className="animate-modal-in flex w-[min(94vw,452px)] flex-col items-center gap-5 rounded-[26px] border border-white/12 bg-[#111215]/94 px-7 py-8 text-center shadow-[0_32px_90px_-22px_rgba(0,0,0,0.92)] backdrop-blur-2xl"
      >
        <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/12 text-rose-300">
          {info.offline ? <WifiOff size={24} strokeWidth={2} /> : <ServerCrash size={24} strokeWidth={2} />}
        </div>
        <div className="flex flex-col gap-2">
          <h2 id="source-error-title" className="font-display text-[21px] font-semibold tracking-[-0.02em] text-white">
            {t(info.title)}
          </h2>
          <p className="text-[13.5px] leading-relaxed text-white/65">{t(info.detail)}</p>
        </div>
        <div className="flex w-full flex-col gap-1 rounded-2xl border border-white/10 bg-black/45 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {t("Source said")}
            </span>
            <span className="font-mono text-[13px] font-semibold text-rose-300">
              {codeLabel}
              {statusName ? ` ${t(statusName)}` : ""}
            </span>
          </div>
          {error.host && (
            <div className="truncate text-start font-mono text-[11.5px] text-white/50">{error.host}</div>
          )}
        </div>
        <div className="flex w-full items-center gap-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 text-[13.5px] font-semibold text-white/85 transition-colors hover:border-white/24 hover:bg-white/14 hover:text-white"
          >
            <RotateCcw size={15} strokeWidth={2.2} />
            {t("Retry")}
          </button>
          <button
            type="button"
            onClick={onChoose}
            className="flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-full bg-white text-[13.5px] font-semibold text-[#0a0b0d] transition-opacity hover:opacity-90"
          >
            <ListVideo size={16} strokeWidth={2.2} />
            {t("Choose another source")}
          </button>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} strokeWidth={2.2} className="dir-icon" />
            {t("Back")}
          </button>
        )}
      </div>
    </div>
  );
}
