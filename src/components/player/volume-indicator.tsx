import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { NORMAL_FRACTION, VOL_MAX, boostColor, fractionFromValue } from "./transport/transport-utils";

export type VolumeIndicatorState = {
  visible: boolean;
  volume: number;
  muted: boolean;
  seq: number;
};

export function VolumeIndicator({
  state,
  allowBoost,
}: {
  state: VolumeIndicatorState;
  allowBoost: boolean;
}) {
  const t = useT();
  const max = allowBoost ? VOL_MAX : 1;
  const volume = Math.max(0, Math.min(max, state.volume));
  const muted = state.muted || volume <= 0;
  const fillPct = muted ? 0 : (allowBoost ? fractionFromValue(volume) : volume) * 100;
  const pct = Math.round((muted ? 0 : volume) * 100);
  const boosting = allowBoost && !muted && volume > 1.001;
  const color = boostColor(volume);
  const Icon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      key={state.seq}
      className={`pointer-events-none absolute left-1/2 top-9 z-30 flex min-w-[16rem] -translate-x-1/2 items-center gap-3.5 rounded-[20px] border border-white/14 bg-black/82 py-3 ps-3 pe-4 text-white shadow-[0_22px_58px_-22px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-[opacity,transform] duration-200 ease-out ${
        state.visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-95 opacity-0"
      }`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-white/12 ring-1 ring-white/10"
        style={{ color: boosting ? color : "rgba(255,255,255,0.95)" }}
      >
        <Icon size={24} strokeWidth={2.1} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/58">
            {t("Volume")}
          </span>
          <span
            className="font-mono text-[22px] font-bold tabular-nums leading-none"
            style={{ color: boosting ? color : "rgba(255,255,255,0.92)" }}
          >
            {muted ? t("Muted") : `${pct}%`}
          </span>
        </span>
        <span className="relative h-2.5 overflow-hidden rounded-full bg-white/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.55)]">
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
            style={{ width: `${fillPct}%`, background: boosting ? color : "rgba(255,255,255,0.92)" }}
          />
          {allowBoost && (
            <span
              className="absolute inset-y-[-2px] w-px bg-white/35"
              style={{ left: `${NORMAL_FRACTION * 100}%` }}
            />
          )}
        </span>
      </span>
    </div>
  );
}
