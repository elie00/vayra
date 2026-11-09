// While a seek key is held, the target moves at a speed measured in seek steps
// per held second, doubling after 1, 3 and 6 seconds. Measured in time rather
// than key repeats, it does not depend on the macOS key repeat rate.
const SPEEDS: ReadonlyArray<readonly [heldMs: number, stepsPerSecond: number]> = [
  [6000, 24],
  [3000, 12],
  [1000, 6],
  [0, 3],
];
// The player seeks to the moving target at most this often, then once on release.
const FLUSH_MS = 300;

export function holdSeekSpeed(stepSec: number, heldMs: number): number {
  const [, stepsPerSecond] = SPEEDS.find(([from]) => heldMs >= from) ?? SPEEDS[SPEEDS.length - 1];
  return stepSec * stepsPerSecond;
}

type Held = {
  key: string;
  direction: 1 | -1;
  stepSec: number;
  startedAt: number;
  movedAt: number;
  flushedAt: number;
  targetSec: number;
  flushedSec: number;
};

export function createHoldSeek(seekTo: (sec: number) => void) {
  let held: Held | null = null;

  const flush = (now: number) => {
    if (!held || held.targetSec === held.flushedSec) return;
    held.flushedSec = held.targetSec;
    held.flushedAt = now;
    seekTo(held.targetSec);
  };

  return {
    /** First press of a seek key, once its regular step has taken playback to `targetSec`. */
    press(key: string, deltaSec: number, targetSec: number, now: number) {
      held = {
        key,
        direction: deltaSec < 0 ? -1 : 1,
        stepSec: Math.abs(deltaSec),
        startedAt: now,
        movedAt: now,
        flushedAt: now,
        targetSec,
        flushedSec: targetSec,
      };
    },
    /** Key repeat while the key stays down. */
    repeat(key: string, now: number, durationSec: number) {
      if (!held || held.key !== key) return;
      const moved = (holdSeekSpeed(held.stepSec, now - held.startedAt) * (now - held.movedAt)) / 1000;
      const end = durationSec > 0 ? durationSec : Number.POSITIVE_INFINITY;
      held.targetSec = Math.min(end, Math.max(0, held.targetSec + held.direction * moved));
      held.movedAt = now;
      if (now - held.flushedAt >= FLUSH_MS) flush(now);
    },
    /** Key released (or window blurred when `key` is omitted): land on the target right away. */
    release(key: string | undefined, now: number) {
      if (!held || (key !== undefined && held.key !== key)) return;
      flush(now);
      held = null;
    },
  };
}
