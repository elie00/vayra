import { expect, it, vi } from "vitest";
import { createHoldSeek, holdSeekSpeed } from "./hold-seek";

it("speeds up the longer the key is held", () => {
  expect(holdSeekSpeed(10, 0)).toBe(30);
  expect(holdSeekSpeed(10, 999)).toBe(30);
  expect(holdSeekSpeed(10, 1000)).toBe(60);
  expect(holdSeekSpeed(10, 3000)).toBe(120);
  expect(holdSeekSpeed(10, 6000)).toBe(240);
});

it("seeks to the moving target at most every 300 ms and lands on release", () => {
  const seekTo = vi.fn();
  const hold = createHoldSeek(seekTo);
  hold.press("ArrowRight", 10, 110, 0);
  // Key repeats every 100 ms once the OS repeat starts at 500 ms.
  for (let t = 500; t <= 900; t += 100) hold.repeat("ArrowRight", t, 7200);
  // 0.9 s held at 30 s/s: 27 s past the first step.
  expect(seekTo.mock.calls.map(([sec]) => Math.round(sec))).toEqual([125, 134]);
  hold.release("ArrowRight", 950);
  expect(seekTo).toHaveBeenLastCalledWith(137);
  expect(seekTo).toHaveBeenCalledTimes(3);
});

it("stops at the start and the end of the video", () => {
  const seekTo = vi.fn();
  const hold = createHoldSeek(seekTo);
  hold.press("ArrowLeft", -10, 5, 0);
  hold.repeat("ArrowLeft", 2000, 7200);
  hold.release("ArrowLeft", 2000);
  expect(seekTo).toHaveBeenLastCalledWith(0);

  hold.press("ArrowRight", 10, 7190, 0);
  hold.repeat("ArrowRight", 2000, 7200);
  hold.release(undefined, 2000);
  expect(seekTo).toHaveBeenLastCalledWith(7200);
});

it("ignores repeats and releases of another key, and a plain tap", () => {
  const seekTo = vi.fn();
  const hold = createHoldSeek(seekTo);
  hold.press("ArrowRight", 10, 110, 0);
  hold.repeat("ArrowLeft", 600, 7200);
  hold.release("ArrowLeft", 700);
  hold.release("ArrowRight", 800);
  expect(seekTo).not.toHaveBeenCalled();
});
