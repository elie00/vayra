import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getSeekHovering, subscribeSeekHovering } from "@/lib/player/playback-clock";
import { CHROME_HIDE_MS_PAUSED, CHROME_HIDE_MS_PLAYING, CHROME_HIDE_MS_RESUME } from "../player-utils";

export function useChromeVisibility(params: {
  playing: boolean;
  drawMode: boolean;
  pipMode: boolean;
  setChromeHidden: (hidden: boolean) => void;
}) {
  const { playing, drawMode, pipMode, setChromeHidden } = params;
  const [chromeVisible, setChromeVisible] = useState(false);
  const chromeVisibleRef = useRef(false);
  useEffect(() => {
    chromeVisibleRef.current = chromeVisible;
  }, [chromeVisible]);

  const hideTimer = useRef<number | null>(null);
  const anyMenuOpenRef = useRef(false);
  const resumeHideRef = useRef(false);

  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    setChromeHidden(pipMode);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (anyMenuOpenRef.current || getSeekHovering()) return;
    let wait = playing && !drawMode ? CHROME_HIDE_MS_PLAYING : CHROME_HIDE_MS_PAUSED;
    if (resumeHideRef.current) {
      resumeHideRef.current = false;
      wait = CHROME_HIDE_MS_RESUME;
    }
    hideTimer.current = window.setTimeout(() => {
      setChromeVisible(false);
      setChromeHidden(true);
    }, wait);
  }, [playing, drawMode, pipMode, setChromeHidden]);

  const hideForResume = useCallback(() => {
    resumeHideRef.current = true;
  }, []);

  useEffect(() => {
    wakeChrome();
    const onMove = () => wakeChrome();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchstart", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onMove);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setChromeHidden(false);
    };
  }, [wakeChrome, setChromeHidden]);

  useEffect(() => {
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      if (!playing || drawMode) return;
      if (anyMenuOpenRef.current || getSeekHovering()) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setChromeVisible(false);
      setChromeHidden(true);
    };
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [playing, drawMode, setChromeHidden]);

  useEffect(() => {
    const onBlur = () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setChromeVisible(false);
      setChromeHidden(true);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [setChromeHidden]);

  useEffect(
    () =>
      subscribeSeekHovering(() => {
        if (getSeekHovering()) {
          setChromeVisible(true);
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
        } else {
          wakeChrome();
        }
      }),
    [wakeChrome],
  );

  const [anyMenuOpen, setAnyMenuOpen] = useState(false);
  useEffect(() => {
    anyMenuOpenRef.current = anyMenuOpen;
    if (anyMenuOpen) {
      setChromeVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    } else {
      wakeChrome();
    }
  }, [anyMenuOpen, wakeChrome]);

  const cursorStyle: CSSProperties = drawMode
    ? { cursor: "none" }
    : !chromeVisible && playing
      ? { cursor: "none" }
      : { cursor: "default" };

  return {
    chromeVisible,
    wakeChrome,
    hideForResume,
    anyMenuOpen,
    setAnyMenuOpen,
    cursorStyle,
  };
}
