import { afterEach, expect, it, vi } from "vitest";
import { watchPlaybackWake, localResumeWithin } from "./wake-monitor";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("checks after sleep or reconnection, not ordinary timer ticks, and cleans up", () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const events = new Map<string, () => void>();
  vi.stubGlobal("window", { addEventListener: (key: string, callback: () => void) => events.set(key, callback), removeEventListener: (key: string) => events.delete(key) });
  const check = vi.fn(); const stop = watchPlaybackWake(check);
  vi.advanceTimersByTime(10000); expect(check).not.toHaveBeenCalled();
  vi.setSystemTime(3600000); events.get("focus")?.(); expect(check).toHaveBeenCalledTimes(1);
  events.get("online")?.(); expect(check).toHaveBeenCalledTimes(2);
  stop(); expect(events.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("bounds local file checks so an unavailable disk cannot block Play indefinitely", async () => {
  vi.useFakeTimers(); const result = localResumeWithin(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(1500); expect(await result).toBeNull();
  expect(await localResumeWithin(async () => { throw new Error("disk offline"); })).toBeNull();
});
