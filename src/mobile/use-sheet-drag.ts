import { useEffect, useRef, useState, type RefObject } from "react";
import { dismissThreshold, insideScrolledList, nextDragPhase, startsOnSlider, type DragPhase } from "./sheet-drag";

type Touch = { id: number; startX: number; startY: number; phase: DragPhase; scrolled: boolean; offset: number };

/**
 * Pull the whole sheet down to close it. Returns the current pull, to translate the
 * sheet by while dragging; below the threshold the sheet springs back.
 */
export function useSheetDrag(
  sheetRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
): number {
  const [offset, setOffset] = useState(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet) return;
    let touch: Touch | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touch = null;
        return;
      }
      const t = e.touches[0];
      touch = {
        id: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        phase: startsOnSlider(e.target) ? "ignored" : "pending",
        scrolled: insideScrolledList(e.target, sheet),
        offset: 0,
      };
    };
    const onMove = (e: TouchEvent) => {
      if (!touch) return;
      const t = Array.from(e.touches).find((x) => x.identifier === touch!.id);
      if (!t) return;
      const dy = t.clientY - touch.startY;
      touch.phase = nextDragPhase(touch.phase, t.clientX - touch.startX, dy, touch.scrolled);
      if (touch.phase !== "dismissing") return;
      e.preventDefault();
      touch.offset = Math.max(0, dy);
      setOffset(touch.offset);
    };
    const onEnd = () => {
      const done = touch?.phase === "dismissing" && touch.offset > dismissThreshold(sheet.getBoundingClientRect().height);
      touch = null;
      setOffset(0);
      if (done) dismissRef.current();
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetRef, active]);

  return offset;
}
