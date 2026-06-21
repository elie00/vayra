import { Minus, Square, X } from "lucide-react";
import { close, minimize, toggleMaximize } from "@/lib/window";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function WindowControlButtons({ t }: { t: (key: string) => string }) {
  if (!IS_TAURI) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-1">
      <button
        onClick={minimize}
        aria-label={t("chrome.minimize")}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/85 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
      >
        <Minus size={16} strokeWidth={2.2} />
      </button>
      <button
        onClick={toggleMaximize}
        aria-label={t("chrome.maximize")}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/85 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
      >
        <Square size={13} strokeWidth={2.2} />
      </button>
      <button
        onClick={close}
        aria-label={t("common.close")}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/85 backdrop-blur-md transition-colors hover:bg-danger hover:text-white"
      >
        <X size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}
