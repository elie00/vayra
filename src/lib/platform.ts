function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isWeb(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

// Tauri running on Android. The native backend keeps a subset of commands
// (torrent engine, stream proxy, settings, streams pipeline, http fetch,
// stremio auth, downloads, web serve, cloudflare relay) but returns Err for
// all desktop-only ones (mpv, cast, tray, pip, discord, multiview, dvr,
// window management, webview memory helpers, HDR/modal overlays, in-app
// browser, updater).
export function isAndroidTauri(): boolean {
  if (!isTauri()) return false;
  return /android/i.test(navigator.userAgent || "");
}

// Mobile Tauri = Android for now (iOS would be added here). Used as the single
// switch for "behave like the web build for desktop-only features".
export function isMobileTauri(): boolean {
  return isAndroidTauri();
}

// True only for Tauri on a desktop OS. Any feature backed by a desktop-only
// native command must gate on this so that on mobile Tauri it stays hidden /
// disabled exactly like it is in the web build.
export function hasDesktopFeatures(): boolean {
  return isTauri() && !isMobileTauri();
}

export function isLinuxDesktop(): boolean {
  if (!isTauri()) return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  if (ua.includes("android")) return false;
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("mac os")) return false;
  return ua.includes("linux") || plat.includes("linux");
}

export function isMacDesktop(): boolean {
  if (!isTauri()) return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  return ua.includes("macintosh") || ua.includes("mac os") || plat.includes("mac");
}

export function isWindowsDesktop(): boolean {
  if (!isTauri()) return false;
  return (navigator.userAgent || "").toLowerCase().includes("windows");
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
  if ((navigator.maxTouchPoints ?? 0) > 0 && Math.min(window.innerWidth, window.innerHeight) < 640) {
    return true;
  }
  return false;
}
