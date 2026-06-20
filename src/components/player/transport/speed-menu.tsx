import { Clock, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SLEEP_PRESETS, type SleepTimerState } from "@/views/player/hooks/use-sleep-timer";
import { useT } from "@/lib/i18n";
import { Tooltip } from "./tooltip";

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function SpeedMenu({
  rate,
  onRate,
  sleep,
  onOpenChange,
}: {
  rate: number;
  onRate: (r: number) => void;
  sleep?: SleepTimerState;
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
  const choices = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const current = Math.abs(rate - 1) < 0.01 ? "1×" : `${rate}×`;
  const sleepActive = sleep != null && sleep.mode.kind !== "off";
  const accent = open || Math.abs(rate - 1) > 0.01 || sleepActive;
  const sleepLabel = (() => {
    if (!sleep || sleep.mode.kind === "off") return null;
    if (sleep.mode.kind === "minutes" && sleep.remainingMs != null) {
      return formatRemaining(sleep.remainingMs);
    }
    if (sleep.mode.kind === "end_episode") return t("End ep");
    if (sleep.mode.kind === "end_next_episode")
      return t("+{n} ep", { n: sleep.mode.remaining });
    return null;
  })();
  return (
    <div ref={wrap} className="relative">
      <Tooltip label={sleep ? t("Speed & sleep") : t("Playback speed")}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={t("Speed and sleep timer")}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 transition-[background-color,color] ${
            accent ? "bg-white/22 text-white hover:bg-white/30" : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Gauge size={22} strokeWidth={1.9} />
          {sleepActive && sleepLabel ? (
            <span className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums tracking-wider">
              <Clock size={11} strokeWidth={2.4} />
              {sleepLabel}
            </span>
          ) : Math.abs(rate - 1) > 0.01 ? (
            <span className="text-[11px] font-bold tabular-nums tracking-wider">{current}</span>
          ) : null}
        </button>
      </Tooltip>
      {open && (
        <div className="absolute bottom-[calc(100%+10px)] end-0 w-[400px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className={`grid ${sleep ? "grid-cols-2" : "grid-cols-1"}`}>
            <Section title={t("Playback speed")}>
              {choices.map((r) => {
                const isSel = Math.abs(r - rate) < 0.01;
                return (
                  <Row
                    key={r}
                    selected={isSel}
                    label={r === 1 ? t("Normal") : `${r}×`}
                    hint={r === 1 ? t("default") : undefined}
                    onClick={() => {
                      onRate(r);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </Section>
            {sleep && (
              <Section title={t("Sleep timer")} leftBorder>
                {SLEEP_PRESETS.map((p) => {
                  const isSel =
                    (sleep.mode.kind === "minutes" &&
                      p.mode.kind === "minutes" &&
                      sleep.mode.total === p.mode.total) ||
                    (sleep.mode.kind === p.mode.kind && p.mode.kind !== "minutes");
                  const hint =
                    isSel && sleep.remainingMs != null && p.mode.kind === "minutes"
                      ? formatRemaining(sleep.remainingMs)
                      : undefined;
                  return (
                    <Row
                      key={p.id}
                      selected={isSel}
                      label={t(p.label)}
                      hint={hint}
                      onClick={() => {
                        sleep.set(p.mode);
                        setOpen(false);
                      }}
                    />
                  );
                })}
                {sleepActive && (
                  <button
                    onClick={() => {
                      sleep.cancel();
                      setOpen(false);
                    }}
                    className="mt-1 flex h-10 w-full items-center rounded-lg px-3 text-start text-[14px] font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    {t("Cancel timer")}
                  </button>
                )}
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  leftBorder,
  children,
}: {
  title: string;
  leftBorder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`p-2 ${leftBorder ? "border-s border-edge-soft" : ""}`}>
      <div className="px-3 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Row({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-full items-center justify-between rounded-lg px-3 text-start text-[14px] transition-colors ${
        selected ? "bg-elevated text-ink ring-1 ring-edge" : "text-ink-muted hover:bg-canvas/55 hover:text-ink"
      }`}
    >
      <span className={selected ? "font-medium" : ""}>{label}</span>
      {hint && (
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
          {hint}
        </span>
      )}
    </button>
  );
}
