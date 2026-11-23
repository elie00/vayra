import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { useRef } from "react";
import type { PlayerCapabilities, PlayerSnapshot } from "@/lib/player/bridge";
import type { VolumeStyle } from "@/lib/player-chrome";
import { useT } from "@/lib/i18n";
import { Tooltip } from "./tooltip";
import {
  NORMAL_FRACTION,
  TRACK_WIDTH,
  VOL_MAX,
  boostColor,
  fractionFromValue,
  valueFromFraction,
} from "./transport-utils";

export function VolumeControl({
  snap,
  onMute,
  onVolume,
  capabilities,
  style = "slider",
}: {
  snap: PlayerSnapshot;
  onMute: () => void;
  onVolume: (v: number) => void;
  capabilities: PlayerCapabilities;
  style?: VolumeStyle;
}) {
  const tr = useT();
  const allowBoost = capabilities.engine === "mpv";
  const max = allowBoost ? VOL_MAX : 1;
  const v = snap.muted ? 0 : Math.max(0, Math.min(max, snap.volume));
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = (clientX: number) => {
    const t = trackRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const next = allowBoost ? valueFromFraction(f) : f;
    onVolume(Math.round(Math.min(max, next) * 100) / 100);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return;
    setFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const step = e.shiftKey ? 0.5 : 0.05;
    const next = Math.max(0, Math.min(max, v + (e.deltaY < 0 ? step : -step)));
    onVolume(Math.round(next * 100) / 100);
  };

  const fillFraction = allowBoost ? fractionFromValue(v) : v;
  const color = boostColor(v);
  const muted = snap.muted || v === 0;
  const pct = Math.round(v * 100);
  const boosting = allowBoost && v > 1.001;
  const label = muted ? tr("Unmute") : tr("Mute");

  const breakPct = NORMAL_FRACTION * 100;
  const filledPct = fillFraction * 100;
  const fillBackground =
    v <= 1
      ? "rgba(255,255,255,0.92)"
      : `linear-gradient(to right, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.92) ${
          (breakPct / filledPct) * 100
        }%, #a8aaad ${(breakPct / filledPct) * 100}%, ${color} 100%)`;

  const muteBtn = (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onMute}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-[background-color,color,transform] duration-150 hover:bg-white/12 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none"
        aria-label={label}
      >
        {muted ? <VolumeX size={20} strokeWidth={1.9} /> : <Volume2 size={20} strokeWidth={1.9} />}
      </button>
    </Tooltip>
  );

  if (style === "icon-only") {
    return (
      <div className="flex items-center" onWheel={onWheel}>
        {muteBtn}
      </div>
    );
  }

  if (style === "stepper") {
    const step = (delta: number) => {
      const next = Math.max(0, Math.min(max, v + delta));
      onVolume(Math.round(next * 100) / 100);
    };
    return (
      <div className="flex items-center gap-1" onWheel={onWheel}>
        {muteBtn}
        <Tooltip label={tr("Volume down")}>
          <button
            onClick={() => step(-0.05)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={tr("Volume down")}
          >
            <Minus size={16} strokeWidth={2.4} />
          </button>
        </Tooltip>
        <span className="min-w-[2.5rem] text-center font-mono text-[12px] tabular-nums text-white/85">
          {pct}%
        </span>
        <Tooltip label={tr("Volume up")}>
          <button
            onClick={() => step(0.05)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={tr("Volume up")}
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="group/vol flex items-center gap-2" onWheel={onWheel}>
      {muteBtn}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex h-6 shrink-0 cursor-pointer items-center"
        style={{ width: TRACK_WIDTH }}
      >
        <div className="relative h-1.5 w-full rounded-full bg-white/18 transition-[height] duration-150 group-hover/vol:h-2 motion-reduce:transition-none">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${filledPct}%`, background: fillBackground }}
          />
          <div
            className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 group-hover/vol:scale-110 motion-reduce:transition-none"
            style={{
              left: `${filledPct}%`,
              width: 12,
              height: 12,
              background: boosting ? color : "white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.65)",
            }}
          />
        </div>
      </div>
      {boosting && (
        <span
          className="text-[11.5px] font-semibold tabular-nums leading-none"
          style={{ color, minWidth: 36 }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
