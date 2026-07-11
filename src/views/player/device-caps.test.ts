import { describe, expect, it } from "vitest";
import type { CastDeviceInfo } from "@/lib/cast";
import { getDeviceCaps } from "@/lib/cast/device-caps";

function device(name: string, model: string | null = null): CastDeviceInfo {
  return {
    id: name,
    name,
    host: "192.0.2.1",
    port: 8009,
    model,
    kind: "chromecast",
    control_url: null,
    audio_only: false,
    unavailable_reason: null,
  };
}

function roku(name: string, model: string | null): CastDeviceInfo {
  return { ...device(name, model), kind: "roku", port: 8060 };
}

describe("getDeviceCaps cast matrix", () => {
  it("recognizes Google TV Streamer before generic Google TV", () => {
    const caps = getDeviceCaps(device("Living Room", "Google TV Streamer"));
    expect(caps.label).toBe("Google TV Streamer");
    expect(caps.av1).toBe(true);
  });

  it("recognizes Nvidia Shield passthrough capabilities", () => {
    const caps = getDeviceCaps(device("SHIELD", "SHIELD Android TV"));
    expect(caps.label).toBe("Nvidia Shield TV");
    expect(caps.passthroughDts).toBe(true);
  });

  it("keeps older Chromecast models on conservative defaults", () => {
    const caps = getDeviceCaps(device("Bedroom Chromecast", "Chromecast Gen 2"));
    expect(caps.maxResolution).toBe(1080);
    expect(caps.hevc).toBe(false);
  });

  it("recognizes official Chromecast with Google TV hardware references", () => {
    expect(getDeviceCaps(device("Living Room", "GZRNL")).label).toBe(
      "Chromecast with Google TV (4K)",
    );
    expect(getDeviceCaps(device("Bedroom", "G454V")).label).toBe(
      "Chromecast with Google TV (HD)",
    );
  });

  it("does not assume an unidentified Google TV target supports 4K", () => {
    const caps = getDeviceCaps(device("Family Google TV", "Google TV"));
    expect(caps.maxResolution).toBe(1080);
    expect(caps.dolbyVision).toBe(false);
  });

  it("keeps unknown and older Roku devices on the conservative HD profile", () => {
    expect(getDeviceCaps(roku("Bedroom Roku", "Roku Express (3900X)")).maxResolution).toBe(1080);
    expect(getDeviceCaps(roku("Unknown Roku", null)).hevc).toBe(false);
  });

  it("recognizes Roku 4K families from names and model numbers", () => {
    expect(getDeviceCaps(roku("Roku", "Roku Express 4K+ (3941X)")).maxResolution).toBe(2160);
    expect(getDeviceCaps(roku("Roku", "Streaming Stick 4K (3820X)")).hdr10).toBe(true);
    expect(getDeviceCaps(roku("Living Room", "Roku Ultra (4802X)")).label).toBe("Roku Ultra");
  });
});
