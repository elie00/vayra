import { describe, expect, it } from "vitest";
import type { TranscodeProfile } from "@/lib/cast";
import type { DeviceCaps } from "@/lib/cast/device-caps";
import {
  UNIVERSAL_SAFE_PROFILE,
  pickCastTranscodeProfile,
  type CastResolution,
} from "./cast-resolve";

const caps = {} as DeviceCaps;

describe("pickCastTranscodeProfile", () => {
  it("preserves the device-tuned profile for a transcode (no 1080p flattening)", () => {
    const profile: TranscodeProfile = {
      max_height: 2160,
      force_h264: false,
      force_aac: false,
      force_stereo: false,
    };
    const resolved: CastResolution = { kind: "transcode", url: "u", caps, profile, reasons: [] };
    expect(pickCastTranscodeProfile(resolved, { forceTranscode: true })).toEqual(profile);
    // Regression guard: a 4K HEVC-capable device must not be flattened to 1080p.
    expect(pickCastTranscodeProfile(resolved, { forceTranscode: true })).not.toEqual(
      UNIVERSAL_SAFE_PROFILE,
    );
  });

  it("falls back to the universal safe profile for a forced transcode with no device profile", () => {
    const resolved: CastResolution = { kind: "compat", url: "u", caps };
    expect(pickCastTranscodeProfile(resolved, { forceTranscode: true })).toEqual(
      UNIVERSAL_SAFE_PROFILE,
    );
  });

  it("returns undefined when no transcode is needed", () => {
    const resolved: CastResolution = { kind: "compat", url: "u", caps };
    expect(pickCastTranscodeProfile(resolved, { forceTranscode: false })).toBeUndefined();
  });
});
