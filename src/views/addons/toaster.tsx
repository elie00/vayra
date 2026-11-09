import { Check, X } from "lucide-react";
import type { ToastInfo } from "./addons-types";

export function Toaster({ toast }: { toast: ToastInfo | null }) {
  if (!toast) return null;
  const isOk = toast.kind === "ok";
  return (
    // On a phone: full width above the tab bar, and a card rather than a pill once it wraps.
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[160] -translate-x-1/2 animate-popover-in max-sm:inset-x-4 max-sm:bottom-[calc(var(--harbor-tabbar,0px)+0.75rem)] max-sm:translate-x-0">
      <div
        className={`pointer-events-auto flex items-center gap-2.5 rounded-full border bg-elevated/95 py-1.5 ps-1.5 pe-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur-md max-sm:rounded-2xl max-sm:py-2.5 max-sm:ps-2.5 ${
          isOk ? "border-edge-soft" : "border-rose-300/40"
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isOk ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"
          }`}
        >
          {isOk ? <Check size={13} strokeWidth={2.6} /> : <X size={13} strokeWidth={2.6} />}
        </span>
        <span className="text-[12.5px] font-medium text-ink">
          {toast.text}
          {toast.addon && (
            <span className="text-ink-muted"> · {toast.addon.name}</span>
          )}
        </span>
      </div>
    </div>
  );
}
