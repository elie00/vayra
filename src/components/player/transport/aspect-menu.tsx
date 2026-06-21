import { Ratio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CROP_PRESETS } from "@/views/player/hooks/use-video-fill";
import { useT } from "@/lib/i18n";
import { Tooltip } from "./tooltip";

export function AspectMenu({
  mode,
  onMode,
  onOpenChange,
}: {
  mode: string;
  onMode: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const active = mode !== "fit";
  const accent = open || active;
  const current = CROP_PRESETS.find((m) => m.id === mode);
  return (
    <div ref={wrap} className="relative">
      <Tooltip label={t("Aspect ratio")}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={t("Aspect ratio")}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 transition-[background-color,color] ${
            accent ? "bg-white/22 text-white hover:bg-white/30" : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Ratio size={22} strokeWidth={1.9} />
          {active && current ? (
            <span className="text-[11px] font-bold tabular-nums tracking-wider">{current.label}</span>
          ) : null}
        </button>
      </Tooltip>
      {open && (
        <div className="absolute bottom-[calc(100%+10px)] end-0 w-[240px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="p-2">
            <div className="px-3 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
              {t("Aspect ratio")}
            </div>
            <div className="flex flex-col gap-0.5">
              {CROP_PRESETS.map((m) => {
                const sel = m.id === mode;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onMode(m.id);
                      setOpen(false);
                    }}
                    className={`flex h-10 w-full items-center justify-between rounded-lg px-3 text-start text-[14px] transition-colors ${
                      sel ? "bg-elevated text-ink ring-1 ring-edge" : "text-ink-muted hover:bg-canvas/55 hover:text-ink"
                    }`}
                  >
                    <span className={sel ? "font-medium" : ""}>{t(m.label)}</span>
                    {m.id === "fit" && (
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                        {t("default")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
