import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { isMobileTauri } from "@/lib/platform";
import { toggleWindowFullscreen } from "@/lib/fullscreen-state";
import { useWindowFullscreen } from "@/lib/use-window-fullscreen";

// Mobile Tauri rejects every plugin:window|* invoke ("Window API not available
// on mobile"), so never hold a window handle there — the desktop titlebar/resize
// chrome that uses it is hidden on mobile anyway. Prevents an unhandled rejection
// at boot from useMaximized()'s isMaximized()/isFullscreen() probe.
const win: Window | null = isTauri() && !isMobileTauri() ? getCurrentWindow() : null;

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const minimize = async () => {
  await win?.minimize().catch(() => {});
};

/**
 * The middle window button. macOS puts a window fullscreen where the other
 * platforms maximize it, and going fullscreen has to run through the app's own
 * enter/exit: those are what save the window's frame and give it back on the way
 * out, and what the rest of the UI reads to know it is fullscreen. Calling
 * `setFullscreen` straight left the window on a stale frame and the UI out of step.
 */
export const toggleMaximize = async () => {
  if (IS_MAC) {
    await toggleWindowFullscreen();
    return;
  }
  await win?.toggleMaximize().catch(() => {});
};

export const close = async () => {
  await win?.close().catch(() => {});
};

export type ResizeDir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export function startResize(direction: ResizeDir) {
  win?.startResizeDragging(direction).catch(() => {});
}

export function useMaximized(): boolean {
  // On macOS the button toggles fullscreen, whose state the app already tracks:
  // read it rather than re-probe the window, or the icon lags a resize behind.
  const fullscreen = useWindowFullscreen();
  const [maxed, setMaxed] = useState(false);
  useEffect(() => {
    if (!win || IS_MAC) return;
    let cancelled = false;
    let timer: number | null = null;
    const check = () => {
      win.isMaximized().then((v) => {
        if (!cancelled) setMaxed(v);
      });
    };
    check();
    const schedule = () => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        check();
      }, 150);
    };
    const unlisten = win.onResized(schedule);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      unlisten.then((fn) => fn());
    };
  }, []);
  return IS_MAC ? fullscreen : maxed;
}

export function openUrl(url: string) {
  if (!url) return;
  if (isTauri()) {
    tauriOpenUrl(url).catch(() => {
      invoke("browser_open", { url }).catch(() => {
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          /* swallow */
        }
      });
    });
    return;
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* swallow */
  }
}

// Hosts that aggressively block iframe embedding (X-Frame-Options DENY,
// bot/captcha challenges, etc.). For these, skip the viewport — open
// in the user's real browser instead, like a normal link.
const IFRAME_HOSTILE_HOSTS = [
  "imdb.com",
  "www.imdb.com",
  "m.imdb.com",
  "youtube.com",
  "www.youtube.com",
  "accounts.google.com",
  "github.com",
  "x.com",
  "twitter.com",
];

function isIframeHostile(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IFRAME_HOSTILE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function openInAppBrowser(url: string, title?: string) {
  if (!url) return;
  // The in-app embed viewport is a desktop-only child webview; on mobile Tauri
  // open links in the system browser instead.
  if (isIframeHostile(url) || isMobileTauri()) {
    openUrl(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("vayra:open-embed-viewport", { detail: { url, title } }),
    );
  }
}
