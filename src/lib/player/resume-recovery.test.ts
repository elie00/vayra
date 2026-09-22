import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResumeRecovery, RESUME_CHECK_MS, RESUME_RECOVERY_MS } from "./resume-recovery";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const reload = vi.fn(async (_position: number, _isCurrent: () => boolean) => {});
  const onState = vi.fn();
  return { reload, onState, recovery: createResumeRecovery({ reload, onState }) };
}

describe("explicit resume watchdog", () => {
  it("does not reload a normal resume in the middle of a film", async () => {
    const { recovery, reload } = setup();
    recovery.start(1800);
    recovery.observe(1800.5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once at the bookmark after a stalled resume", async () => {
    const { recovery, reload, onState } = setup();
    recovery.start(1800);
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    expect(reload).toHaveBeenCalledWith(1800, expect.any(Function));
    recovery.observe(0); // transient position during loadfile
    expect(recovery.isActive()).toBe(true);
    recovery.observe(1801);
    expect(recovery.isActive()).toBe(true);
    recovery.observe(1802);
    expect(onState).toHaveBeenLastCalledWith("recovered");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not mistake duplicate position or file readiness for progress", async () => {
    const { recovery, reload } = setup();
    recovery.start(200);
    recovery.observe(200);
    recovery.observe(NaN);
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("repeated Play cannot postpone the deadline", async () => {
    const { recovery, reload } = setup();
    recovery.start(300);
    await vi.advanceTimersByTimeAsync(4000);
    recovery.start(300);
    await vi.advanceTimersByTimeAsync(4000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("cancels on pause, seek, source replacement or destruction", async () => {
    const { recovery, reload, onState } = setup();
    recovery.start(300);
    recovery.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
  });

  it("times out even if the reload promise never settles", async () => {
    const { recovery, reload, onState } = setup();
    reload.mockImplementation(() => new Promise(() => {}));
    recovery.start(300);
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS + RESUME_RECOVERY_MS);
    expect(onState).toHaveBeenLastCalledWith("failed");
    expect(recovery.isActive()).toBe(false);
  });

  it("ignores a late rejection from a canceled attempt", async () => {
    const { recovery, reload, onState } = setup();
    let reject!: (error: Error) => void;
    reload.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    recovery.start(300);
    recovery.recover();
    const isCurrent = reload.mock.calls[0][1];
    recovery.cancel();
    recovery.start(600);
    expect(isCurrent()).toBe(false);
    reject(new Error("old failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).not.toHaveBeenCalledWith("failed");
  });
});
