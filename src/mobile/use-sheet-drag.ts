import { useEffect, useRef, type RefObject } from "react";
import { haptic } from "./haptics";
import {
  insideScrolledList, nextDragPhase, releaseVelocity, rubberBand, scrimOpacity, shouldDismiss, startsOnSlider,
  type DragPhase, type DragSample,
} from "./sheet-drag";

type Touch = { id: number; startX: number; startY: number; phase: DragPhase; scrolled: boolean; offset: number; samples: DragSample[] };

const SNAP_BACK_MS = 200;

/**
 * Pull the whole sheet down to close it. While the finger is down the sheet is
 * the finger: its transform and the scrim's opacity are written straight to the
 * elements, with no transition and no render. On release a long pull or a flick
 * throws it out at the speed it was moving; anything else snaps back fast.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, onDismiss: () => void, active = true): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet) return;
    const scrim = sheet.parentElement?.querySelector<HTMLElement>(":scope > .vayra-scrim") ?? null;
    let touch: Touch | null = null;
    let settle: number | null = null;

    const clear = () => {
      if (settle !== null) window.clearTimeout(settle);
      settle = null;
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (scrim) {
        scrim.style.transition = "";
        scrim.style.opacity = "";
      }
    };
    // A sheet reopened while its exit was still playing starts clean.
    clear();

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // A second finger never takes over a drag already under way.
        if (touch?.phase !== "dismissing") touch = null;
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
        samples: [],
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
      if (settle !== null) window.clearTimeout(settle);
      settle = null;
      touch.offset = rubberBand(dy);
      touch.samples.push({ y: dy, t: e.timeStamp });
      if (touch.samples.length > 8) touch.samples.shift();
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${touch.offset}px)`;
      if (scrim) {
        scrim.style.transition = "none";
        scrim.style.opacity = String(scrimOpacity(touch.offset, sheet.offsetHeight));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!touch || Array.from(e.touches).some((x) => x.identifier === touch!.id)) return;
      const ended = touch;
      touch = null;
      if (ended.phase !== "dismissing") return;
      const height = sheet.offsetHeight;
      const velocity = releaseVelocity(ended.samples, e.timeStamp);
      if (e.type === "touchend" && shouldDismiss(ended.offset, height, velocity)) {
        // Leave at the speed of the throw: the rest of the way at the release
        // velocity, within what still reads as one motion.
        const ms = Math.round(Math.min(260, Math.max(120, (height - ended.offset) / Math.max(velocity, 0.5))));
        sheet.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0, 0.4, 1)`;
        sheet.style.transform = "translateY(100%)";
        if (scrim) {
          scrim.style.transition = `opacity ${ms}ms linear`;
          scrim.style.opacity = "0";
        }
        haptic();
        dismissRef.current();
        return;
      }
      sheet.style.transition = `transform ${SNAP_BACK_MS}ms var(--ease-out)`;
      sheet.style.transform = "translateY(0)";
      if (scrim) {
        scrim.style.transition = `opacity ${SNAP_BACK_MS}ms var(--ease-out)`;
        scrim.style.opacity = "1";
      }
      settle = window.setTimeout(clear, SNAP_BACK_MS + 20);
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      if (settle !== null) window.clearTimeout(settle);
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetRef, active]);
}
