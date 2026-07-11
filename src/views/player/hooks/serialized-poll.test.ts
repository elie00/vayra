import { describe, expect, it } from "vitest";
import { startSerializedPoll } from "./serialized-poll";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// A hand-driven scheduler so the test controls when the "1s later" callback runs.
function fakeScheduler() {
  const pending: Array<{ id: number; fn: () => void }> = [];
  let next = 1;
  return {
    setTimeout: (fn: () => void) => {
      const id = next++;
      pending.push({ id, fn });
      return id;
    },
    clearTimeout: (id: number) => {
      const i = pending.findIndex((p) => p.id === id);
      if (i >= 0) pending.splice(i, 1);
    },
    fireAll() {
      const due = pending.splice(0);
      for (const p of due) p.fn();
    },
    count: () => pending.length,
  };
}

describe("startSerializedPoll", () => {
  it("never overlaps polls: the next is scheduled only after the current resolves", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    let resolveCurrent: () => void = () => {};
    const poll = () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise<void>((resolve) => {
        resolveCurrent = () => {
          active--;
          resolve();
        };
      });
    };
    const sched = fakeScheduler();
    const stop = startSerializedPoll(poll, 1000, sched);

    // First poll runs immediately; nothing is scheduled while it's in flight.
    expect(calls).toBe(1);
    expect(sched.count()).toBe(0);

    // Firing timers can't spawn a second poll before the first resolves.
    sched.fireAll();
    await flush();
    expect(calls).toBe(1);
    expect(maxActive).toBe(1);

    // Resolve the first poll -> the next tick is scheduled (not run yet).
    resolveCurrent();
    await flush();
    expect(sched.count()).toBe(1);

    // Fire it -> second poll starts, still no overlap.
    sched.fireAll();
    await flush();
    expect(calls).toBe(2);
    expect(maxActive).toBe(1);

    stop();
  });

  it("stops scheduling after stop(): a late timer callback is a no-op", async () => {
    let calls = 0;
    const poll = () => {
      calls++;
      return Promise.resolve();
    };
    const sched = fakeScheduler();
    const stop = startSerializedPoll(poll, 1000, sched);
    await flush(); // first poll resolved, next scheduled
    expect(calls).toBe(1);
    expect(sched.count()).toBe(1);

    stop();
    sched.fireAll(); // any remaining callback must do nothing
    await flush();
    expect(calls).toBe(1);
  });
});
