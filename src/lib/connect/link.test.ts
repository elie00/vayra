import { expect, it, vi } from "vitest";
import type { ConnectState } from "./host";
import { macPosition } from "./link";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const state = (patch: Partial<ConnectState>): ConnectState => ({
  status: "playing",
  positionSec: 100,
  durationSec: 110,
  rate: 1,
  volume: 1,
  muted: false,
  title: "Pilot",
  meta: { id: "tt0903747", type: "series", name: "Breaking Bad" },
  at: 10_000,
  ...patch,
});

it("moves the Mac's position on while it plays, up to the end", () => {
  expect(macPosition(state({}), 14_000)).toBe(104);
  expect(macPosition(state({ rate: 1.5 }), 14_000)).toBe(106);
  expect(macPosition(state({}), 60_000)).toBe(110);
  expect(macPosition(state({}), 9_000)).toBe(100);
});

it("keeps the position still while the Mac is paused", () => {
  expect(macPosition(state({ status: "paused" }), 14_000)).toBe(100);
});
