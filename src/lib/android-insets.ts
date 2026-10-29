// Android WebView before 136 reports env(safe-area-inset-*) as 0 in an
// edge-to-edge activity, so MainActivity measures the system bars and hands
// them over in CSS px: `VayraInsets.read()` for the value known at boot, then
// `__VAYRA_INSETS__` on each change. index.css turns them into
// --harbor-status-bar and --vayra-safe-bottom.

export type SystemInsets = { top: number; bottom: number };

declare global {
  interface Window {
    VayraInsets?: { read(): string };
    __VAYRA_INSETS__?: (insets: SystemInsets) => void;
  }
}

export function applySystemInsets({ top, bottom }: SystemInsets, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--vayra-inset-top", `${top}px`);
  root.style.setProperty("--vayra-inset-bottom", `${bottom}px`);
}

export function installAndroidInsets(): void {
  window.__VAYRA_INSETS__ = (insets) => applySystemInsets(insets);
  const known = window.VayraInsets?.read();
  if (known) applySystemInsets(JSON.parse(known) as SystemInsets);
}
