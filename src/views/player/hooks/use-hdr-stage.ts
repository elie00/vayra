import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isWindowsDesktop } from "@/lib/platform";
import {
  hdrOverlayClose,
  hdrOverlayOpen,
  onHdrStageDead,
  onHdrStageReady,
} from "@/lib/hdr-overlay";
import type { Settings } from "@/lib/settings";

const HDR_GAMMAS = new Set(["pq", "hlg"]);
const MONITOR_DEBOUNCE_MS = 600;
const LIVENESS_TIMEOUT_MS = 2500;

export type HdrStageState = { requested: boolean; confirmed: boolean };

function raiseStage() {
  void invoke("mpv_set_hdr_stage", { active: true }).catch(() => {});
  window.dispatchEvent(new Event("harbor:mpv-force-geom"));
}

function dropStage() {
  void invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
  window.dispatchEvent(new Event("harbor:mpv-force-geom"));
}

async function displayHdrActive(): Promise<boolean> {
  try {
    return await invoke<boolean>("display_hdr_active");
  } catch {
    return false;
  }
}

export function useHdrStage(params: {
  engine: "html5" | "mpv";
  embedActive: boolean;
  hdrGamma: string;
  playerHdrStage: Settings["playerHdrStage"];
  playerHdrToSdr: boolean;
  onFallback?: () => void;
}): HdrStageState {
  const { engine, embedActive, hdrGamma, playerHdrStage, playerHdrToSdr, onFallback } = params;
  const [want, setWant] = useState(false);
  const [requested, setRequested] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;

  const eligible =
    isWindowsDesktop() &&
    engine === "mpv" &&
    embedActive &&
    playerHdrStage !== "off" &&
    !playerHdrToSdr &&
    !failed &&
    HDR_GAMMAS.has(hdrGamma);

  useEffect(() => {
    if (!eligible) {
      setWant(false);
      return;
    }
    if (playerHdrStage === "always") {
      setWant(true);
      return;
    }
    const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    let cancelled = false;
    let unMoved: (() => void) | null = null;
    let timer: number | null = null;
    const recheck = async () => {
      const w = await displayHdrActive();
      if (!cancelled) setWant(w);
    };
    void recheck();
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const off = await getCurrentWindow().onMoved(() => {
        if (timer != null) window.clearTimeout(timer);
        timer = window.setTimeout(() => void recheck(), MONITOR_DEBOUNCE_MS);
      });
      if (cancelled) off();
      else unMoved = off;
    })();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      unMoved?.();
    };
  }, [eligible, playerHdrStage]);

  useEffect(() => {
    if (!want) return;
    const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    let cancelled = false;
    let unReady: (() => void) | null = null;
    let unDead: (() => void) | null = null;
    let timer: number | null = null;
    let confirmedOnce = false;
    setRequested(true);

    const clearTimer = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const fallback = () => {
      if (cancelled) return;
      clearTimer();
      dropStage();
      setConfirmed(false);
      onFallbackRef.current?.();
      setFailed(true);
    };
    const armWatchdog = () => {
      clearTimer();
      timer = window.setTimeout(fallback, LIVENESS_TIMEOUT_MS);
    };
    const onReady = () => {
      if (cancelled) return;
      armWatchdog();
      if (!confirmedOnce) {
        confirmedOnce = true;
        raiseStage();
        setConfirmed(true);
      }
    };
    const onDead = () => fallback();

    void (async () => {
      unReady = await onHdrStageReady(onReady);
      unDead = await onHdrStageDead(onDead);
      if (cancelled) {
        unReady?.();
        unDead?.();
        return;
      }
      armWatchdog();
      await hdrOverlayOpen();
    })();

    return () => {
      cancelled = true;
      clearTimer();
      unReady?.();
      unDead?.();
      setRequested(false);
      setConfirmed(false);
      void hdrOverlayClose();
      dropStage();
    };
  }, [want]);

  return { requested, confirmed };
}
