import { useRef, useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { isMobileTauri } from "@/lib/platform";

const DOUBLE_TAP_MS = 300;
const SKIP_SEC = 10;
// A swipe this far (px) and mostly vertical on the right half moves the volume.
const SWIPE_START_PX = 12;
// The share of the picture's height a swipe covers from silent to full.
const SWIPE_RANGE = 0.7;

type Swipe = { id: number; x: number; y: number; from: number | null; active: boolean };

type Side = "back" | "forward";

export function DragClickStage(props: {
  drawMode: boolean;
  pipMode: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onWheelVolume?: (deltaY: number) => void;
  /** Phones: a tap shows or hides the controls instead of the click's play/pause;
   *  a double tap on the left or right third skips back or forward 10s. */
  touchTap?: { start: () => void; end: () => void; seek?: (delta: number) => void };
  /** Phones: a vertical swipe on the right half moves the media volume (0–1). */
  volume?: { read: () => number | null; write: (level: number) => void };
}) {
  const { drawMode, pipMode, onClick, onDoubleClick, onWheelVolume, touchTap, volume } = props;
  const onTouchTap = touchTap?.end;
  const lastTap = useRef<{ at: number; side: Side | null } | null>(null);
  const [skip, setSkip] = useState<{ side: Side; key: number } | null>(null);
  const swipe = useRef<Swipe | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const hideLevel = useRef<number | null>(null);
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[3]"
      // The stage owns touch gestures on a phone (taps, double taps, the volume swipe).
      style={touchTap ? { touchAction: "none" } : undefined}
      onPointerDown={(e) => {
        if (!touchTap || e.pointerType !== "touch" || e.target !== e.currentTarget) return;
        touchTap.start();
        const rect = e.currentTarget.getBoundingClientRect();
        swipe.current =
          volume && e.clientX - rect.left > rect.width / 2
            ? { id: e.pointerId, x: e.clientX, y: e.clientY, from: null, active: false }
            : null;
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (!s || !volume || e.pointerId !== s.id) return;
        const dy = e.clientY - s.y;
        if (!s.active) {
          if (Math.abs(dy) < SWIPE_START_PX || Math.abs(dy) < Math.abs(e.clientX - s.x)) return;
          s.from = volume.read();
          if (s.from == null) {
            swipe.current = null;
            return;
          }
          s.active = true;
          if (hideLevel.current != null) window.clearTimeout(hideLevel.current);
        }
        const height = e.currentTarget.getBoundingClientRect().height || 1;
        const next = Math.max(0, Math.min(1, (s.from ?? 0) - dy / (height * SWIPE_RANGE)));
        volume.write(next);
        setLevel(next);
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (s?.active) {
          hideLevel.current = window.setTimeout(() => setLevel(null), 700);
          return;
        }
        if (!onTouchTap || e.pointerType !== "touch" || e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
        const side: Side | null = x < 0.38 ? "back" : x > 0.62 ? "forward" : null;
        const prev = lastTap.current;
        lastTap.current = { at: e.timeStamp, side };
        if (side && touchTap?.seek && prev?.side === side && e.timeStamp - prev.at < DOUBLE_TAP_MS) {
          touchTap.seek(side === "back" ? -SKIP_SEC : SKIP_SEC);
          setSkip({ side, key: e.timeStamp });
          return;
        }
        onTouchTap();
      }}
      onWheel={(e) => {
        if (drawMode || pipMode) return;
        if (e.ctrlKey || e.metaKey) return;
        onWheelVolume?.(e.deltaY);
      }}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        // The mouse events a tap synthesises would play/pause on top of onTouchTap.
        if (onTouchTap) return;
        if (e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();
        let dragStarted = false;
        const onMove = (ev: MouseEvent) => {
          if (dragStarted) return;
          if (Date.now() - startTime < 150) return;
          const dx = Math.abs(ev.clientX - startX);
          const dy = Math.abs(ev.clientY - startY);
          if (dx > 8 || dy > 8) {
            dragStarted = true;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            // Dragging the OS window by the video is desktop-only; the window
            // API rejects on mobile.
            if (!isMobileTauri()) {
              import("@tauri-apps/api/window")
                .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
                .catch(() => {});
            }
          }
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          if (!dragStarted) onClick();
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        if (onTouchTap) return;
        onDoubleClick();
      }}
    >
      {level != null && <VolumeLevel level={level} />}
      {skip && (
        <span
          key={skip.key}
          aria-hidden
          className={`vayra-skip pointer-events-none absolute top-1/2 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-[13px] font-semibold text-white ${
            skip.side === "back" ? "left-[14%]" : "right-[14%]"
          }`}
        >
          {skip.side === "back" ? `−${SKIP_SEC} s` : `+${SKIP_SEC} s`}
        </span>
      )}
    </div>
  );
}

// The level while a swipe moves the volume: a vertical bar on the right, as video
// apps show it, instead of the system panel.
function VolumeLevel({ level }: { level: number }) {
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <span
      role="status"
      aria-label={`${Math.round(level * 100)} %`}
      className="pointer-events-none absolute end-[8%] top-[42%] flex -translate-y-1/2 flex-col items-center gap-2.5 rounded-full bg-black/55 px-2.5 py-3.5 text-white backdrop-blur-md"
    >
      <Icon size={20} />
      <span className="relative h-24 w-1.5 overflow-hidden rounded-full bg-white/25">
        <span className="absolute inset-x-0 bottom-0 rounded-full bg-white" style={{ height: `${level * 100}%` }} />
      </span>
      <span className="text-[12px] font-semibold tabular-nums">{Math.round(level * 100)}</span>
    </span>
  );
}
