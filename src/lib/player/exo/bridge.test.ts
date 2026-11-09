// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createExoBridge } from "./bridge";

const IDLE = JSON.stringify({ position: 0, duration: -1, buffered: 0, paused: true, buffering: false, ended: false, error: null });

// Android's Java bridge refuses a method called away from the injected object:
// "Java bridge method can't be invoked on a non-injected object".
function strictBridge() {
  const calls: Array<[string, string | undefined]> = [];
  const api: Record<string, (arg?: string) => string> = {};
  for (const name of ["init", "setVisible", "getState", "load", "play", "pause", "stop", "destroy", "setVolume", "setMuted", "setResize", "setSubTrack"]) {
    api[name] = function (this: unknown, arg?: string) {
      if (this !== api) throw new Error("Java bridge method can't be invoked on a non-injected object");
      calls.push([name, arg]);
      return name === "getState" ? IDLE : "ok";
    };
  }
  return { api, calls };
}

afterEach(() => {
  delete (window as { HarborExo?: unknown }).HarborExo;
});

it("calls the Java bridge on its own object, so a load reaches ExoPlayer", async () => {
  const { api, calls } = strictBridge();
  (window as { HarborExo?: unknown }).HarborExo = api;
  const bridge = createExoBridge();
  const snaps: string[] = [];
  bridge.subscribe((s) => snaps.push(s.status));
  bridge.attach(document.createElement("div"));
  await bridge.load({ url: "https://media.example.invalid/film.mp4" });
  expect(calls.find(([name]) => name === "load")?.[1]).toContain("film.mp4");
  expect(snaps).not.toContain("error");
  vi.restoreAllMocks();
});
