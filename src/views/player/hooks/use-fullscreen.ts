import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function useFullscreen(stageRef: RefObject<HTMLDivElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const sustainTimerRef = useRef<number | null>(null);
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [stageRef]);

  useEffect(() => {
    return () => {
      if (!fullscreenRef.current) return;
      const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        void (async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("window_fullscreen_exit");
          } catch {
            /* ignore */
          }
        })();
      } else if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const stopSustain = () => {
      if (sustainTimerRef.current != null) {
        window.clearInterval(sustainTimerRef.current);
        sustainTimerRef.current = null;
      }
    };
    if (!fullscreen) {
      stopSustain();
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        window.dispatchEvent(new Event("harbor:mpv-refresh-geom"));
        await invoke("webview_reapply_transparency").catch(() => {});
        await invoke("mpv_force_below").catch(() => {});
        await invoke("hdr_overlay_sync").catch(() => {});
      } catch {
        /* not tauri */
      }
    };
    sustainTimerRef.current = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      stopSustain();
    };
  }, [fullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const kickGeom = () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("harbor:mpv-refresh-geom"));
    };
    const forceBelow = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("mpv_force_below");
      } catch {
        /* not in tauri or mpv not running */
      }
    };
    const reapplyTransparency = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("webview_reapply_transparency");
      } catch {
        /* not in tauri */
      }
    };
    const overlaySync = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("hdr_overlay_sync");
      } catch {
        /* not in tauri */
      }
    };
    const kickRepeatedly = () => {
      kickGeom();
      void reapplyTransparency();
      void forceBelow();
      void overlaySync();
      const delays = [60, 160, 320, 640, 1100, 1700, 2400, 3200, 4200];
      for (const d of delays) {
        window.setTimeout(kickGeom, d);
        window.setTimeout(() => void reapplyTransparency(), d);
        window.setTimeout(() => void forceBelow(), d);
        window.setTimeout(() => void overlaySync(), d);
      }
    };
    const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        if (fullscreenRef.current) {
          setFullscreen(false);
          await invoke("window_fullscreen_exit");
        } else {
          setFullscreen(true);
          await invoke("window_fullscreen_enter");
        }
        kickRepeatedly();
        return;
      } catch (e) {
        console.warn("[player] windowed-fullscreen failed", e);
        return;
      }
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (stageRef.current?.requestFullscreen) {
        await stageRef.current.requestFullscreen();
      }
      kickRepeatedly();
    } catch (e) {
      console.warn("[player] fullscreen toggle failed", e);
    }
  }, [stageRef]);

  return { fullscreen, toggleFullscreen };
}
