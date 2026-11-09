import { expect, it, vi } from "vitest";
import { emptySnapshot, type PlayerSnapshot } from "@/lib/player/bridge";
import { createConnectPublisher, type ConnectState } from "./host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const media = { title: "Pilot", meta: { id: "tt0903747", type: "series" as const, name: "Breaking Bad" }, episode: { season: 1, episode: 1 } };
const snap = (patch: Partial<PlayerSnapshot>): PlayerSnapshot => ({
  ...emptySnapshot,
  status: "playing",
  positionSec: 100,
  durationSec: 2820,
  rate: 1,
  ...patch,
});

function setup() {
  const send = vi.fn(async (_state: ConnectState | null) => {});
  return { send, publisher: createConnectPublisher(send), sent: () => send.mock.calls.map(([s]) => s) };
}

it("publishes changes and seeks, not smooth progress", () => {
  const { publisher, sent } = setup();
  publisher.update(snap({ status: "idle" }), media, 0);
  publisher.update(snap({}), media, 1_000);
  publisher.update(snap({ positionSec: 105 }), media, 6_000);
  publisher.update(snap({ positionSec: 400 }), media, 7_000);
  publisher.update(snap({ positionSec: 401, volume: 0.5 }), media, 8_000);
  publisher.update(snap({ positionSec: 402, volume: 0.5 }), { ...media, episode: { season: 1, episode: 2 } }, 9_000);
  expect(sent().map((s) => [s?.positionSec, s?.volume, s?.episode?.episode, s?.at])).toEqual([
    [100, 1, 1, 1_000],
    [400, 1, 1, 7_000],
    [401, 0.5, 1, 8_000],
    [402, 0.5, 2, 9_000],
  ]);
});

it("tells phones once when the player closes", () => {
  const { publisher, send } = setup();
  publisher.clear();
  expect(send).not.toHaveBeenCalled();
  publisher.update(snap({}), media, 0);
  publisher.clear();
  publisher.clear();
  expect(send).toHaveBeenLastCalledWith(null);
  expect(send).toHaveBeenCalledTimes(2);
});
