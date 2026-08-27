import { describe, expect, it } from "vitest";
import { deriveHtml5PlaybackState } from "./playback-state";

const base = {
  paused: true,
  ended: false,
  hasError: false,
  readyState: 0,
  currentTime: 0,
  rendered: false,
};

describe("HTML5 playback state", () => {
  it("distinguishes loading, paused, playing and buffering", () => {
    expect(deriveHtml5PlaybackState(base)).toMatchObject({ status: "loading", buffering: false });
    expect(deriveHtml5PlaybackState({ ...base, readyState: 3 })).toMatchObject({
      status: "paused",
      buffering: false,
    });
    expect(deriveHtml5PlaybackState({ ...base, paused: false, readyState: 3 })).toMatchObject({
      status: "playing",
      buffering: false,
    });
    expect(deriveHtml5PlaybackState({ ...base, paused: false, readyState: 2 })).toMatchObject({
      status: "playing",
      buffering: true,
    });
  });

  it("gives errors and completion precedence over playback", () => {
    expect(deriveHtml5PlaybackState({ ...base, paused: false, hasError: true })).toMatchObject({
      status: "error",
      buffering: false,
    });
    expect(deriveHtml5PlaybackState({ ...base, paused: false, ended: true })).toMatchObject({
      status: "ended",
      buffering: false,
    });
  });

  it("latches rendered only after the playback clock advances", () => {
    expect(deriveHtml5PlaybackState({ ...base, paused: false, currentTime: 0 }).rendered).toBe(false);
    expect(deriveHtml5PlaybackState({ ...base, paused: false, currentTime: 0.1 }).rendered).toBe(true);
    expect(deriveHtml5PlaybackState({ ...base, rendered: true }).rendered).toBe(true);
    expect(deriveHtml5PlaybackState({ ...base, paused: false, currentTime: 1, hasError: true }).rendered).toBe(false);
  });
});
