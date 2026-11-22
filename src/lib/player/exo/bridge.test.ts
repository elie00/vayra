// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createExoBridge, screenBrightness, setScreenBrightness } from "./bridge";

const IDLE = JSON.stringify({ position: 0, duration: -1, buffered: 0, paused: true, buffering: false, ended: false, error: null });

// Android's Java bridge refuses a method called away from the injected object:
// "Java bridge method can't be invoked on a non-injected object".
function strictBridge() {
  const calls: Array<[string, string | undefined]> = [];
  const api: Record<string, (arg?: string) => string> = {};
  for (const name of [
    "init",
    "setVisible",
    "getState",
    "load",
    "play",
    "pause",
    "stop",
    "destroy",
    "setVolume",
    "setMuted",
    "setResize",
    "setSubTrack",
    "getScreenBrightness",
    "setScreenBrightness",
  ]) {
    api[name] = function (this: unknown, arg?: string) {
      if (this !== api) throw new Error("Java bridge method can't be invoked on a non-injected object");
      calls.push([name, arg]);
      if (name === "getState") return IDLE;
      if (name === "getScreenBrightness") return "0.65";
      return "ok";
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

it("maps Fill (panscan) to media3 zoom, Stretch to media3 fill, and Fit to fit", () => {
  const { api, calls } = strictBridge();
  (window as { HarborExo?: unknown }).HarborExo = api;
  const bridge = createExoBridge();
  bridge.attach(document.createElement("div"));

  bridge.setPanscan(1);
  bridge.setStretch(false);
  expect(calls.filter(([n]) => n === "setResize").at(-1)?.[1]).toBe("zoom");

  bridge.setPanscan(0);
  bridge.setStretch(true);
  expect(calls.filter(([n]) => n === "setResize").at(-1)?.[1]).toBe("fill");

  bridge.setStretch(false);
  expect(calls.filter(([n]) => n === "setResize").at(-1)?.[1]).toBe("fit");
});

it("reads and clamps window screen brightness through HarborExo", () => {
  const { api, calls } = strictBridge();
  (window as { HarborExo?: unknown }).HarborExo = api;
  expect(screenBrightness()).toBe(0.65);
  setScreenBrightness(0);
  expect(calls.find(([n]) => n === "setScreenBrightness")?.[1]).toBe("0.01");
  setScreenBrightness(1.5);
  expect(calls.filter(([n]) => n === "setScreenBrightness").at(-1)?.[1]).toBe("1");
});
