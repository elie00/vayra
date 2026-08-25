import { describe, expect, it } from "vitest";
import {
  checkStreamCompat,
  needsTranscode,
  pickBestCompatStream,
  pickTranscodeProfile,
  type DeviceCaps,
} from "./device-caps";

// A modern 4K target that passes audio through untouched.
const capable: DeviceCaps = {
  label: "capable",
  maxResolution: 2160,
  hevc: true,
  av1: true,
  dolbyVision: true,
  hdr10: true,
  passthroughAc3: true,
  passthroughEac3: true,
  passthroughTruehd: true,
  passthroughDts: true,
  containerMkv: true,
};

// An older 1080p stick: H.264 and AC-3 only.
const modest: DeviceCaps = {
  ...capable,
  label: "modest",
  maxResolution: 1080,
  hevc: false,
  av1: false,
  dolbyVision: false,
  hdr10: false,
  passthroughEac3: false,
  passthroughTruehd: false,
  passthroughDts: false,
  containerMkv: false,
};

const stream = (title: string) => ({ title });

describe("checkStreamCompat", () => {
  it("passes a stream the device can take as it is", () => {
    expect(checkStreamCompat(stream("Movie.1080p.x264.AC3"), modest).ok).toBe(true);
  });

  it("names each thing the device cannot take", () => {
    const v = checkStreamCompat(stream("Movie.2160p.HEVC.TrueHD.mkv"), modest);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/2160p above device max/);
    expect(v.reasons.join(" ")).toMatch(/HEVC/);
    expect(v.reasons.join(" ")).toMatch(/TrueHD/);
  });

  it("lets the same stream through on a capable device", () => {
    expect(checkStreamCompat(stream("Movie.2160p.HEVC.TrueHD.mkv"), capable).ok).toBe(true);
  });

  it("reads the live dimensions ahead of the title", () => {
    const live = { title: "Movie.720p", liveWidth: 3840, liveHeight: 2160 };
    expect(checkStreamCompat(live, modest).reasons.join(" ")).toMatch(/2160p above device max/);
  });

  it("agrees with needsTranscode", () => {
    const s = stream("Movie.2160p.HEVC");
    expect(needsTranscode(s, modest)).toBe(!checkStreamCompat(s, modest).ok);
    expect(needsTranscode(s, capable)).toBe(false);
  });
});

describe("pickBestCompatStream", () => {
  it("takes the highest resolution the device can play", () => {
    const streams = [
      stream("Movie.720p.x264.AC3"),
      stream("Movie.1080p.x264.AC3"),
      stream("Movie.2160p.HEVC"),
    ];
    expect(pickBestCompatStream(streams, modest)).toEqual(stream("Movie.1080p.x264.AC3"));
  });

  it("picks nothing when none of them fit", () => {
    expect(pickBestCompatStream([stream("Movie.2160p.HEVC")], modest)).toBeNull();
    expect(pickBestCompatStream([], modest)).toBeNull();
  });
});

describe("pickTranscodeProfile", () => {
  it("caps the height at what the device can show", () => {
    expect(pickTranscodeProfile(stream("Movie.2160p.HEVC"), modest).max_height).toBe(1080);
  });

  it("does not upscale a smaller source to the device maximum", () => {
    expect(pickTranscodeProfile(stream("Movie.720p.HEVC"), capable).max_height).toBe(720);
  });

  it("re-encodes video only for a codec the device lacks", () => {
    expect(pickTranscodeProfile(stream("Movie.1080p.HEVC.AC3"), modest).force_h264).toBe(true);
    expect(pickTranscodeProfile(stream("Movie.1080p.x264.AC3"), modest).force_h264).toBe(false);
  });

  it("re-encodes audio only for a format the device lacks", () => {
    expect(pickTranscodeProfile(stream("Movie.1080p.x264.DTS"), modest).force_aac).toBe(true);
    expect(pickTranscodeProfile(stream("Movie.1080p.x264.AC3"), modest).force_aac).toBe(false);
  });

  it("keeps surround when the device can still take AC-3", () => {
    const p = pickTranscodeProfile(stream("Movie.1080p.x264.DTS"), modest);
    expect(p.force_stereo).toBe(false);
  });

  it("gives a bitrate ceiling that follows the height", () => {
    const uhd = pickTranscodeProfile(stream("Movie.2160p"), capable).max_video_kbps ?? 0;
    const fhd = pickTranscodeProfile(stream("Movie.1080p"), capable).max_video_kbps ?? 0;
    expect(uhd).toBeGreaterThan(fhd);
    expect(fhd).toBeGreaterThan(0);
  });
})
