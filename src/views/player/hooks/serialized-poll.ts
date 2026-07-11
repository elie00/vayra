export type PollScheduler = {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

const defaultScheduler: PollScheduler = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/**
 * Run `poll` immediately, then again `intervalMs` after each run *completes* —
 * never on a fixed wall-clock interval. This serializes the loop: a slow poll
 * (e.g. a Chromecast that reconnects each status request) delays the next tick
 * instead of letting ticks pile up and open concurrent connections.
 *
 * Returns a stop function that cancels any pending tick and prevents further
 * scheduling. A poll already in flight still finishes; guard its side effects
 * separately if needed.
 */
export function startSerializedPoll(
  poll: () => Promise<void>,
  intervalMs: number,
  scheduler: PollScheduler = defaultScheduler,
): () => void {
  let stopped = false;
  let timer: number | null = null;

  const runOnce = async () => {
    if (stopped) return;
    try {
      await poll();
    } finally {
      if (!stopped) {
        timer = scheduler.setTimeout(runOnce, intervalMs);
      }
    }
  };

  void runOnce();

  return () => {
    stopped = true;
    if (timer != null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
  };
}
