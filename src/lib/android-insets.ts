// Android WebView before 136 reports env(safe-area-inset-*) as 0 in an
// edge-to-edge activity, so MainActivity measures the system bars, display
// cutout, and IME keyboard and hands them over in CSS px: `VayraInsets.read()`
// for the value known at boot, then `__VAYRA_INSETS__` on each change.
// index.css turns them into --harbor-status-bar, --vayra-safe-bottom/left/right,
// and --vayra-ime-bottom.

export type SystemInsets = {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  ime?: number;
};

declare global {
  interface Window {
    VayraInsets?: { read(): string };
    __VAYRA_INSETS__?: (insets: SystemInsets) => void;
  }
}

export function applySystemInsets(
  { top, bottom, left, right, ime }: SystemInsets,
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty("--vayra-inset-top", `${top}px`);
  root.style.setProperty("--vayra-inset-bottom", `${bottom}px`);
  if (typeof left === "number") root.style.setProperty("--vayra-inset-left", `${left}px`);
  if (typeof right === "number") root.style.setProperty("--vayra-inset-right", `${right}px`);
  if (typeof ime === "number") root.style.setProperty("--vayra-ime-bottom", `${ime}px`);
}

export function installAndroidInsets(): void {
  window.__VAYRA_INSETS__ = (insets) => applySystemInsets(insets);
  const known = window.VayraInsets?.read();
  if (known) applySystemInsets(JSON.parse(known) as SystemInsets);
}
