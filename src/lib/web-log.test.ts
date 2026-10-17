import { afterEach, expect, it, vi } from "vitest";
import { formatLogArgs, forwardConsoleToLog } from "./web-log";

const original = { warn: console.warn, error: console.error };
afterEach(() => {
  console.warn = original.warn;
  console.error = original.error;
});

it("writes what the console printed on one line", () => {
  const error = new Error("boom");
  expect(formatLogArgs(["[service] JustWatch request failed", error, { kind: "movie", n: 2 }])).toBe(
    '[service] JustWatch request failed Error: boom {"kind":"movie","n":2}',
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(formatLogArgs(["x", cyclic, undefined])).toBe("x [object Object] undefined");
});

it("forwards warnings and errors, still printing them, and bounds a flood", () => {
  const sent: string[] = [];
  let now = 0;
  const printed = vi.fn();
  console.warn = printed;
  console.error = printed;
  forwardConsoleToLog((level, message) => sent.push(`${level} ${message}`), () => now);

  console.warn("[engine] select_many failed", "no torrent");
  console.error("[player] fatal");
  expect(sent).toEqual(["warn [engine] select_many failed no torrent", "error [player] fatal"]);
  expect(printed).toHaveBeenCalledTimes(2);

  for (let i = 0; i < 100; i++) console.warn("loop", i);
  expect(sent).toHaveLength(30);
  now = 61_000;
  console.warn("after");
  expect(sent.slice(-2)).toEqual(["warn 72 console lines dropped in the last minute", "warn after"]);
});
