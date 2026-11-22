import { isAndroidTauri } from "@/lib/platform";

export type HapticKind = "tick" | "context" | "confirm" | "reject" | "gesture";

declare global {
  interface Window {
    VayraHaptics?: { perform(kind: string): void };
  }
}

const FALLBACK_MS: Record<HapticKind, number> = {
  tick: 8,
  context: 10,
  confirm: 12,
  reject: 18,
  gesture: 8,
};

/**
 * Tactile feedback on Android: prefers native `View.performHapticFeedback` via
 * `VayraHaptics` (respecting the user's system "Touch feedback" setting and
 * Material 3 haptic primitives), falling back to `navigator.vibrate`.
 */
export function haptic(kind: HapticKind = "tick"): void {
  if (!isAndroidTauri()) return;
  try {
    const bridge = window.VayraHaptics;
    if (bridge && typeof bridge.perform === "function") {
      bridge.perform(kind);
      return;
    }
    navigator.vibrate?.(FALLBACK_MS[kind]);
  } catch {
    /* No haptic actuator: nothing to feel. */
  }
}
