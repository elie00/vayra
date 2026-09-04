import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerSnapshot } from "./bridge";
import { RESUME_CHECK_MS, RESUME_RECOVERY_MS } from "./resume-recovery";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), feedback: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@/lib/app-feedback", () => ({ emitAppFeedback: mocks.feedback }));
vi.mock("@/lib/i18n", () => ({ t: (text: string) => text }));
import { createMpvBridge } from "./mpv";

let event: (payload: Record<string, unknown>) => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  mocks.feedback.mockReset();
  mocks.listen.mockImplementation(async (name, listener) => {
    if (name === "mpv://event") event = (payload) => listener({ payload });
    return () => {};
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function loaded(isLive = false) {
  const bridge = createMpvBridge();
  let snapshot!: PlayerSnapshot;
  bridge.subscribe((value) => { snapshot = value; });
  await bridge.load({ url: "https://example.invalid/film.mkv", headers: { Authorization: "fake" }, isLive });
  event({ event: "file-loaded" });
  property("duration", 3600);
  property("time-pos", 1800);
  event({ event: "playback-restart" });
  mocks.invoke.mockClear();
  return { bridge, snapshot: () => snapshot };
}
function property(name: string, data: unknown) { event({ event: "property-change", name, data }); }
function reloadCalls() {
  return mocks.invoke.mock.calls.filter(([name, args]) => name === "mpv_command" && args.cmd[0] === "loadfile");
}

describe("mpv resume integration", () => {
  it("honors unpause events from native media controls", async () => {
    const { bridge, snapshot } = await loaded();
    bridge.pause();
    property("pause", false);
    expect(snapshot().status).toBe("playing");
  });

  it("keeps a new user pause while recovery is still loading", async () => {
    const { bridge, snapshot } = await loaded();
    bridge.pause();
    await bridge.play();
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    bridge.pause();
    property("pause", false);
    event({ event: "file-loaded" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(snapshot().status).toBe("paused");
    expect(reloadCalls()).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenLastCalledWith("mpv_set_property", { name: "pause", value: true });
  });

  it("resumes from the existing cache without reloading when the clock advances", async () => {
    const { bridge } = await loaded();
    bridge.pause();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    await bridge.play();
    property("pause", false);
    property("time-pos", 1801);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reloadCalls()).toHaveLength(0);
  });

  it("recovers a stalled mid-film resume without touching fullscreen or recreating mpv", async () => {
    const { bridge, snapshot } = await loaded();
    bridge.pause();
    await bridge.play();
    property("pause", false); // not proof of real playback
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    expect(reloadCalls()).toEqual([["mpv_command", { cmd: ["loadfile", "https://example.invalid/film.mkv", "replace", 0, "start=1800,pause=no,aid=auto,sid=no"] }]]);
    property("time-pos", 0);
    expect(snapshot().positionSec).toBe(1800);
    event({ event: "file-loaded" });
    property("time-pos", 1801);
    property("time-pos", 1802);
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot()).toMatchObject({ status: "playing", buffering: false });
    expect(mocks.invoke.mock.calls.some(([name, args]) => /fullscreen|mpv_start|mpv_stop/.test(name) || args?.name === "fullscreen")).toBe(false);
  });

  it("keeps an expired connection during pause from ending the film", async () => {
    const { bridge, snapshot } = await loaded();
    bridge.pause();
    event({ event: "end-file", reason: "error" });
    property("eof-reached", true);
    expect(snapshot()).toMatchObject({ status: "paused", positionSec: 1800, errorCode: null });
    await bridge.play();
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    expect(reloadCalls()).toHaveLength(1);
  });

  it("reports a bounded failure and leaves Play available", async () => {
    const { bridge, snapshot } = await loaded();
    bridge.pause();
    await bridge.play();
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS + RESUME_RECOVERY_MS);
    expect(snapshot()).toMatchObject({ status: "paused", buffering: false, positionSec: 1800, errorCode: null });
    expect(mocks.feedback).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "error" }));
    event({ event: "file-loaded" }); // late loading completion must stay paused
    expect(snapshot().status).toBe("paused");
  });

  it("recovers immediately when the unpause command fails", async () => {
    const { bridge } = await loaded();
    bridge.pause();
    mocks.invoke.mockRejectedValueOnce(new Error("unpause failed"));
    await bridge.play();
    expect(reloadCalls()).toHaveLength(1);
  });

  it.each(["pause", "seek", "destroy"] as const)("cancels pending recovery on %s", async (action) => {
    const { bridge } = await loaded();
    bridge.pause();
    await bridge.play();
    if (action === "seek") bridge.seek(100);
    else bridge[action]();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reloadCalls()).toHaveLength(0);
  });

  it("does not reload the previous source after switching", async () => {
    const { bridge } = await loaded();
    bridge.pause();
    await bridge.play();
    await bridge.load({ url: "https://example.invalid/next.mkv" });
    mocks.invoke.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reloadCalls()).toHaveLength(0);
  });

  it("restores external subtitles and audio after reload", async () => {
    const { bridge } = await loaded();
    property("track-list", [
      { type: "audio", id: 2, selected: true },
      { type: "sub", id: 3, selected: true, external: true, "external-filename": "/tmp/test.srt", lang: "fr" },
    ]);
    bridge.pause();
    await bridge.play();
    await vi.advanceTimersByTimeAsync(RESUME_CHECK_MS);
    expect(reloadCalls()[0][1].cmd[4]).toContain("aid=2,sid=no");
    event({ event: "file-loaded" });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.invoke).toHaveBeenCalledWith("mpv_sub_add", { url: "/tmp/test.srt", lang: "fr", title: null, select: true });
  });

  it("does not apply VOD recovery to live TV", async () => {
    const { bridge } = await loaded(true);
    bridge.pause();
    await bridge.play();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reloadCalls()).toHaveLength(0);
  });
});
