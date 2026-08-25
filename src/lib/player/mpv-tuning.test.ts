import { describe, expect, it } from "vitest";
import type { Settings } from "@/lib/settings";
import { compileMpvOptions } from "./mpv-tuning";

// The playback defaults these options replace, from src-tauri/src/mpv.rs.
const DEFAULT_READAHEAD_SECS = 120;
const DEFAULT_MAX_MIB = 256;

function settings(over: Partial<Settings> = {}): Settings {
  return {
    mpvQuality: "balanced",
    mpvHwdec: "auto",
    mpvBufferBoost: false,
    mpvDownmixStereo: false,
    audioDevice: "auto",
    playerDisplayPanel: "lcd",
    playerHdrToSdr: false,
    mpvTweaks: {},
    ...over,
  } as unknown as Settings;
}

function valueOf(out: string, key: string): string | null {
  for (const line of out.split("\n")) {
    const [k, v] = line.split("=");
    if (k === key) return v ?? null;
  }
  return null;
}

describe("the bigger-buffer toggle", () => {
  it("writes nothing about the buffer when it is off", () => {
    const out = compileMpvOptions(settings());
    expect(valueOf(out, "demuxer-max-bytes")).toBeNull();
    expect(valueOf(out, "demuxer-readahead-secs")).toBeNull();
  });

  it("buffers further ahead than the default it replaces", () => {
    // It used to ask for 20s — a quarter of the default — so the toggle a viewer
    // reaches for on a bad connection made playback stall sooner, not later.
    const out = compileMpvOptions(settings({ mpvBufferBoost: true }));
    const readahead = Number(valueOf(out, "demuxer-readahead-secs"));
    expect(readahead).toBeGreaterThan(DEFAULT_READAHEAD_SECS);
  });

  it("gives that read-ahead the room to hold it", () => {
    const out = compileMpvOptions(settings({ mpvBufferBoost: true }));
    const max = Number((valueOf(out, "demuxer-max-bytes") ?? "").replace("MiB", ""));
    expect(max).toBeGreaterThan(DEFAULT_MAX_MIB);
  });

  it("still lets a hand-written tweak win", () => {
    const out = compileMpvOptions(
      settings({ mpvBufferBoost: true, mpvTweaks: { "demuxer-max-bytes": "1GiB" } }),
    );
    expect(out.trim().split("\n").at(-1)).toBe("demuxer-max-bytes=1GiB");
  });
});
