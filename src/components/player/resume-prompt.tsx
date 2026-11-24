import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useActiveKid } from "@/lib/profiles";
import { useFocusTrap } from "@/lib/use-focus-trap";

const KID_BUBBLES = [10, 24, 40, 55, 70, 84, 93];

export function ResumePrompt({
  resumeSec,
  totalSec,
  title,
  onResume,
  onStartOver,
}: {
  resumeSec: number;
  totalSec: number;
  title: string;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const t = useT();
  const kid = useActiveKid();
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeBtnRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    resumeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onResume();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onResume]);

  const pct = totalSec > 0 ? Math.min(100, Math.round((resumeSec / totalSec) * 100)) : 0;
  if (kid) {
    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-prompt-title"
        tabIndex={-1}
        className="absolute inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#3aa6c4] via-[#1c789f] to-[#0a3d5c] px-8 text-center text-white"
      >
        <div className="pointer-events-none absolute inset-0">
          {KID_BUBBLES.map((left, i) => (
            <span
              key={i}
              className="curfew-bubble absolute bottom-0 rounded-full bg-white/25"
              style={{
                left: `${left}%`,
                width: 12 + (i % 3) * 5,
                height: 12 + (i % 3) * 5,
                animationDelay: `-${(1 + ((i * 1.7) % 6)).toFixed(1)}s`,
                animationDuration: `${6 + (i % 4)}s`,
              }}
            />
          ))}
        </div>
        <div className="curfew-bob pointer-events-none absolute bottom-[12%] left-[9%]">
          <img
            src="/kids/doodles/liloctored.png"
            alt=""
            draggable={false}
            className="h-24 w-auto opacity-85"
          />
        </div>
        <img
          src="/kids/doodles/lilpurpocto.png"
          alt=""
          draggable={false}
          className="pointer-events-none absolute bottom-[10%] right-[10%] h-20 w-auto opacity-75"
        />
        <h2 id="resume-prompt-title" className="relative line-clamp-2 max-w-4xl font-display text-[clamp(36px,6vw,64px)] font-bold leading-none tracking-tight drop-shadow-[0_3px_12px_rgba(0,0,0,0.4)]">
          {title}
        </h2>
        <p className="relative mt-5 text-[22px] font-bold text-white/90">
          {t("Where do you want to start?")}
        </p>
        <div className="relative mt-10 flex flex-col items-center gap-5 sm:flex-row">
          <button
            ref={resumeBtnRef}
            type="button"
            onClick={onResume}
            className="flex h-20 min-w-[280px] items-center justify-center gap-3 rounded-full bg-white px-10 text-[24px] font-extrabold text-[#0c4a6e] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.04] active:scale-[0.97]"
          >
            <Play size={30} strokeWidth={0} fill="currentColor" />
            {t("Keep Watching")}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="flex h-20 min-w-[220px] items-center justify-center gap-3 rounded-full bg-white/15 px-10 text-[24px] font-extrabold text-white ring-2 ring-white/40 transition-transform hover:scale-[1.04] hover:bg-white/25 active:scale-[0.97]"
          >
            <RotateCcw size={28} strokeWidth={2.6} />
            {t("Start Over")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-[90] flex items-end justify-center bg-gradient-to-t from-black/92 via-black/55 to-transparent px-4 pb-16">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-prompt-title"
        tabIndex={-1}
        className="w-full max-w-xl rounded-[26px] border border-white/12 bg-[#111215]/92 p-7 shadow-[0_32px_90px_-22px_rgba(0,0,0,0.92)] backdrop-blur-2xl"
      >
        <p className="vayra-kicker text-white/55">
          {t("Pick up where you left off")}
        </p>
        <h2 id="resume-prompt-title" className="mt-2.5 line-clamp-2 font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white">
          {title}
        </h2>
        <p className="mt-1.5 text-[13.5px] tabular-nums text-white/65">
          {t("{watched} of {total} watched ({pct}%).", {
            watched: formatTime(resumeSec),
            total: formatTime(totalSec),
            pct,
          })}
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            ref={resumeBtnRef}
            type="button"
            onClick={onResume}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a0b0d] shadow-[0_10px_28px_-10px_rgba(0,0,0,0.7)] transition-[opacity,transform] hover:opacity-92 active:scale-[0.98]"
          >
            <Play size={16} fill="currentColor" />
            {t("Resume from {time}", { time: formatTime(resumeSec) })}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-6 text-[13.5px] font-semibold text-white/90 transition-colors hover:border-white/24 hover:bg-white/14"
          >
            <RotateCcw size={15} strokeWidth={2.2} />
            {t("Start Over")}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
