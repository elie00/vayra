let windowFullscreen = false;
let suppressNextExit = false;
let syncStarted = false;
const subs = new Set<() => void>();

export function suppressFullscreenExitOnce(): void {
  suppressNextExit = true;
  setTimeout(() => {
    suppressNextExit = false;
  }, 1000);
}

function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}

function emit(): void {
  for (const fn of subs) fn();
}

export function getWindowFullscreen(): boolean {
  return windowFullscreen;
}

export function subscribeFullscreen(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function setWindowFullscreen(v: boolean): void {
  if (windowFullscreen === v) return;
  windowFullscreen = v;
  emit();
}

export function startWindowFullscreenSync(): void {
  if (syncStarted || !isTauri()) return;
  syncStarted = true;
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      setWindowFullscreen(await win.isFullscreen().catch(() => windowFullscreen));
      await listen("fs://entered", () => setWindowFullscreen(true));
      await listen("fs://exited", () => setWindowFullscreen(false));
    } catch {
      /* not tauri or event API unavailable */
    }
  })();
}

export async function reassertWindowFullscreen(): Promise<void> {
  if (!windowFullscreen || !isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("window_fullscreen_enter");
  } catch {
    /* ignore */
  }
}

export async function enterWindowFullscreen(): Promise<void> {
  setWindowFullscreen(true);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_fullscreen_enter");
    } catch {
      /* ignore */
    }
  } else if (document.documentElement.requestFullscreen) {
    void document.documentElement.requestFullscreen().catch(() => {});
  }
}

export async function exitWindowFullscreen(): Promise<void> {
  if (suppressNextExit) {
    suppressNextExit = false;
    return;
  }
  setWindowFullscreen(false);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_fullscreen_exit");
    } catch {
      /* ignore */
    }
  } else if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  }
}

export async function toggleWindowFullscreen(): Promise<void> {
  if (windowFullscreen) await exitWindowFullscreen();
  else await enterWindowFullscreen();
}
