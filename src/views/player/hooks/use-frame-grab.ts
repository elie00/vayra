import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import type { PlayerBridge } from "@/lib/player/bridge";
import {
  captureBaseTitle,
  captureDir,
  formatPosition,
  formatStamp,
  joinPath,
  safeName,
} from "@/lib/player/capture-path";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import type { PlayerSrc } from "@/lib/view";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type FrameGrabToast = {
  id: number;
  kind: "ok" | "error";
  text: string;
  path?: string;
};

export function useFrameGrab(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
}): { toast: FrameGrabToast | null; trigger: () => void } {
  const { bridgeRef, src } = params;
  const [toast, setToast] = useState<FrameGrabToast | null>(null);
  const busyRef = useRef(false);
  const dismissTimer = useRef<number | null>(null);

  const trigger = useCallback(async () => {
    if (busyRef.current) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    busyRef.current = true;
    try {
      const filename = `${safeName(captureBaseTitle(src))} - ${formatStamp(new Date())} - ${formatPosition(
        getPlaybackPosition(),
      )}.png`;
      const dir = await captureDir();
      const fullPath = dir ? await joinPath(dir, filename) : filename;
      const result = await bridge.screenshot(fullPath);
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
      if (result.ok) {
        let copied = false;
        if (result.path && isTauri) {
          try {
            await writeImage(result.path); // string => JsImage::Path côté Rust, décodé grâce à image-png
            copied = true;
          } catch (e) {
            console.warn("[frame-grab] clipboard copy failed", e);
          }
        }
        setToast({
          id: Date.now(),
          kind: "ok",
          text: copied
            ? `Screenshot copied to clipboard · saved to ${dir ? "Pictures/Harbor" : "downloads"}`
            : `Screenshot saved to ${dir ? "Pictures/Harbor" : "downloads"}`,
          path: result.path,
        });
      } else {
        setToast({
          id: Date.now(),
          kind: "error",
          text: result.error || "Frame grab failed",
        });
      }
      dismissTimer.current = window.setTimeout(() => setToast(null), 5200);
    } finally {
      busyRef.current = false;
    }
  }, [bridgeRef, src.meta.name, src.episode]);

  useEffect(() => () => {
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
  }, []);

  return { toast, trigger };
}
