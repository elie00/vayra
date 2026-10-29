import { isMobileTauri } from "@/lib/platform";

export function DragClickStage(props: {
  drawMode: boolean;
  pipMode: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onWheelVolume?: (deltaY: number) => void;
  /** Phones: a tap shows or hides the controls instead of the click's play/pause. */
  touchTap?: { start: () => void; end: () => void };
}) {
  const { drawMode, pipMode, onClick, onDoubleClick, onWheelVolume, touchTap } = props;
  const onTouchTap = touchTap?.end;
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
    />
  );
}
