import { isMobileTauri, isWeb } from "@/lib/platform";

export type RuntimePlatform = "desktop" | "mobile-native" | "web";

export type PlatformCapabilities = {
  browserPlayback: boolean;
  localFiles: boolean;
  mpvPlayback: boolean;
  nativeDownloads: boolean;
  nativeTorrent: boolean;
  social: boolean;
  systemCast: boolean;
  systemIntegration: boolean;
};

const CAPABILITIES: Record<RuntimePlatform, PlatformCapabilities> = {
  desktop: {
    browserPlayback: true,
    localFiles: true,
    mpvPlayback: true,
    nativeDownloads: true,
    nativeTorrent: true,
    social: true,
    systemCast: true,
    systemIntegration: true,
  },
  "mobile-native": {
    browserPlayback: true,
    localFiles: false,
    mpvPlayback: false,
    nativeDownloads: true,
    nativeTorrent: true,
    social: true,
    systemCast: false,
    systemIntegration: false,
  },
  web: {
    browserPlayback: true,
    localFiles: false,
    mpvPlayback: false,
    nativeDownloads: false,
    nativeTorrent: false,
    social: true,
    systemCast: false,
    systemIntegration: false,
  },
};

export function capabilitiesFor(platform: RuntimePlatform): PlatformCapabilities {
  return CAPABILITIES[platform];
}

export function currentRuntimePlatform(): RuntimePlatform {
  if (isWeb()) return "web";
  if (isMobileTauri()) return "mobile-native";
  return "desktop";
}

export function currentPlatformCapabilities(): PlatformCapabilities {
  return capabilitiesFor(currentRuntimePlatform());
}
