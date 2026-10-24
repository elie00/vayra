// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/player/playback-clock", () => ({
  usePlaybackPositionGated: () => 1800,
  usePlaybackDownloadedGated: () => 0,
}));

import { TimeEnd } from "./time-display";
import { endsAtMs, fmtClock } from "./transport-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("counts the time left at the playback speed", () => {
  expect(endsAtMs(1800, 3600, 1, 0)).toBe(1_800_000);
  expect(endsAtMs(1800, 3600, 1.5, 0)).toBe(1_200_000);
});

it("has no end time without a known duration, speed or time left", () => {
  expect(endsAtMs(0, 0, 1, 0)).toBeNull();
  expect(endsAtMs(10, 3600, 0, 0)).toBeNull();
  expect(endsAtMs(3600, 3600, 1, 0)).toBeNull();
});

it("shows the end time next to the time left", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 24, 21, 0));
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() =>
    root.render(<TimeEnd durationSec={3600} rate={2} timeFormat="remaining" isLiveChannel={false} active />),
  );
  // 30 min left at 2x: 15 min.
  expect(host.textContent).toBe(`-30:00Ends at ${fmtClock(new Date(2026, 9, 24, 21, 15).getTime())}`);
  act(() => root.unmount());
});
