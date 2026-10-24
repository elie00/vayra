import { expect, it, vi } from "vitest";
import { emptySnapshot, type PlayerSnapshot } from "./bridge";
import { createNowPlaying } from "./now-playing";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const snap = (patch: Partial<PlayerSnapshot>): PlayerSnapshot => ({
  ...emptySnapshot,
  status: "playing",
  positionSec: 100,
  durationSec: 3600,
  rate: 1,
  ...patch,
});

type Info = { title: string; duration: number; position: number; rate: number; playing: boolean };

function setup() {
  const send = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => {});
  const nowPlaying = createNowPlaying(send);
  const updates = () =>
    send.mock.calls.filter(([cmd]) => cmd === "now_playing_update").map(([, args]) => args as { info: Info });
  return { send, nowPlaying, updates };
}

it("publishes once playback has a title, then only on state changes", () => {
  const { nowPlaying, updates } = setup();
  nowPlaying.update(snap({ status: "loading", positionSec: 0 }), 0);
  nowPlaying.setTitle("Film", 0);
  expect(updates()).toHaveLength(0);

  nowPlaying.update(snap({}), 1_000);
  // Smooth progress is extrapolated by macOS: nothing to send.
  nowPlaying.update(snap({ positionSec: 105 }), 6_000);
  nowPlaying.update(snap({ status: "paused", positionSec: 106 }), 7_000);

  expect(updates()).toEqual([
    { info: { title: "Film", duration: 3600, position: 100, rate: 1, playing: true } },
    { info: { title: "Film", duration: 3600, position: 106, rate: 1, playing: false } },
  ]);
});

it("republishes after a seek or a speed change", () => {
  const { nowPlaying, updates } = setup();
  nowPlaying.setTitle("Film", 0);
  nowPlaying.update(snap({}), 0);
  nowPlaying.update(snap({ positionSec: 500 }), 1_000);
  nowPlaying.update(snap({ positionSec: 501, rate: 1.5 }), 2_000);
  expect(updates().map((a) => a.info)).toMatchObject([
    { position: 100, rate: 1 },
    { position: 500, rate: 1 },
    { position: 501, rate: 1.5 },
  ]);
});

it("clears the system controls once, when playback had been published", () => {
  const { send, nowPlaying } = setup();
  nowPlaying.clear();
  expect(send).not.toHaveBeenCalled();
  nowPlaying.setTitle("Film", 0);
  nowPlaying.update(snap({}), 0);
  nowPlaying.clear();
  nowPlaying.update(snap({ positionSec: 900 }), 1_000);
  expect(send).toHaveBeenLastCalledWith("now_playing_clear");
});
