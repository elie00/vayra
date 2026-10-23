import type { PlayerSnapshot } from "@/lib/player/bridge";

// Position and buffer move on every tick and reach the UI through the playback
// clock instead. Every other field is compared, so a field added to the
// snapshot later reaches React without being listed here.
const CLOCK_FIELDS: ReadonlySet<string> = new Set<keyof PlayerSnapshot>(["positionSec", "bufferedSec"]);

export function snapChangedIgnoringClock(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PlayerSnapshot>;
  for (const key of keys) {
    if (CLOCK_FIELDS.has(key)) continue;
    if (a[key] !== b[key]) return true;
  }
  return false;
}
