import { useRef, useState } from "react";
import { isMobileTauri } from "@/lib/platform";

const DOUBLE_TAP_MS = 300;
const SKIP_SEC = 10;

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
}) {
  const { drawMode, pipMode, onClick, onDoubleClick, onWheelVolume, touchTap } = props;
  const onTouchTap = touchTap?.end;
  const lastTap = useRef<{ at: number; side: Side | null } | null>(null);
  const [skip, setSkip] = useState<{ side: Side; key: number } | null>(null);
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[3]"
      onPointerDown={(e) => {
        if (!touchTap || e.pointerType !== "touch" || e.target !== e.currentTarget) return;
        touchTap.start();
      }}
      onPointerUp={(e) => {
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
