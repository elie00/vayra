import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "./platform-capabilities";

describe("platform capabilities", () => {
  it("keeps VAYRA Lite browser-first and excludes native-only features", () => {
    expect(capabilitiesFor("web")).toMatchObject({
      browserPlayback: true,
      social: true,
      localFiles: false,
      mpvPlayback: false,
      nativeDownloads: false,
      nativeTorrent: false,
      systemCast: false,
      systemIntegration: false,
    });
  });

  it("keeps the desktop feature set complete", () => {
    expect(Object.values(capabilitiesFor("desktop")).every(Boolean)).toBe(true);
  });

  it("does not advertise desktop integrations on mobile Tauri", () => {
    expect(capabilitiesFor("mobile-native")).toMatchObject({
      nativeDownloads: true,
      nativeTorrent: true,
      mpvPlayback: false,
      systemCast: false,
      systemIntegration: false,
    });
  });
});
