import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isWindowsDesktop } from "@/lib/platform";
import { hdrOverlayClose, hdrOverlayOpen } from "@/lib/hdr-overlay";
import type { Settings } from "@/lib/settings";

const HDR_GAMMAS = new Set(["pq", "hlg"]);
const MONITOR_DEBOUNCE_MS = 600;

export function useHdrStage(params: {
  engine: "html5" | "mpv";
  embedActive: boolean;
  hdrGamma: string;
  playerHdrStage: Settings["playerHdrStage"];
  playerHdrToSdr: boolean;
}): boolean {
  const { engine, embedActive, hdrGamma, playerHdrStage, playerHdrToSdr } = params;
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  activeRef.current = active;
  const seqRef = useRef(0);

  const eligible =
    isWindowsDesktop() &&
    engine === "mpv" &&
    embedActive &&
    playerHdrStage !== "off" &&
    !playerHdrToSdr &&
    HDR_GAMMAS.has(hdrGamma);

  useEffect(() => {
    let cancelled = false;
    const seq = ++seqRef.current;
    const apply = async () => {
      let want = false;
      if (eligible) {
        want = playerHdrStage === "always" ? true : await displayHdrActive();
      }
      if (cancelled || seq !== seqRef.current) return;
      if (want === activeRef.current) return;
      if (want) {
        await invoke("mpv_set_hdr_stage", { active: true }).catch(() => {});
        window.dispatchEvent(new Event("harbor:mpv-force-geom"));
        try {
          await hdrOverlayOpen();
        } catch {
          await invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
          window.dispatchEvent(new Event("harbor:mpv-force-geom"));
          return;
        }
        setActive(true);
      } else {
        await hdrOverlayClose();
        await invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
        window.dispatchEvent(new Event("harbor:mpv-force-geom"));
        setActive(false);
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [eligible, playerHdrStage]);

  useEffect(() => {
    if (!eligible || playerHdrStage === "always") return;
    const isTauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    let unMoved: (() => void) | null = null;
    let timer: number | null = null;
    let cancelled = false;
    const recheck = async () => {
      const want = await displayHdrActive();
      if (cancelled || want === activeRef.current) return;
      if (want) {
        await invoke("mpv_set_hdr_stage", { active: true }).catch(() => {});
        window.dispatchEvent(new Event("harbor:mpv-force-geom"));
        try {
          await hdrOverlayOpen();
        } catch {
          await invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
          window.dispatchEvent(new Event("harbor:mpv-force-geom"));
          return;
        }
        setActive(true);
      } else {
        await hdrOverlayClose();
        await invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
        window.dispatchEvent(new Event("harbor:mpv-force-geom"));
        setActive(false);
      }
    };
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const off = await getCurrentWindow().onMoved(() => {
        if (timer != null) window.clearTimeout(timer);
        timer = window.setTimeout(() => void recheck(), MONITOR_DEBOUNCE_MS);
      });
      if (cancelled) {
        off();
        return;
      }
      unMoved = off;
    })();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      unMoved?.();
    };
  }, [eligible, playerHdrStage]);

  useEffect(() => {
    return () => {
      if (!activeRef.current) return;
      void hdrOverlayClose();
      void invoke("mpv_set_hdr_stage", { active: false }).catch(() => {});
    };
  }, []);

  return active;
}

async function displayHdrActive(): Promise<boolean> {
  try {
    return await invoke<boolean>("display_hdr_active");
  } catch {
    return false;
  }
}
