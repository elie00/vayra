import { isAndroidTauri } from "@/lib/platform";

/** A light tick under the finger, where the finger hides what it just did. */
export function haptic(): void {
  if (!isAndroidTauri()) return;
  try {
    navigator.vibrate?.(8);
  } catch {
    /* No vibrator: nothing to feel. */
  }
}
