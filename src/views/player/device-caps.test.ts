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
});
