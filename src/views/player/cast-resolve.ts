import {
  checkStreamCompat,
  getDeviceCaps,
  pickBestCompatStream,
  pickTranscodeProfile,
  type DeviceCaps,
} from "@/lib/cast/device-caps";
import { isFfmpegPresent, type CastDeviceInfo, type TranscodeProfile } from "@/lib/cast";
import { useDebridClients } from "@/lib/debrid/registry";
import { peekPickerCache } from "@/lib/picker-cache";
import { registerStreamProxy } from "@/lib/stream-proxy";
import { resolveStream } from "@/lib/streams/resolve";
import type { ScoredStream } from "@/lib/streams/types";
import type { PlayerSrc } from "@/lib/view";

export type CastResolution =
  | { kind: "compat"; url: string; caps: DeviceCaps }
  | { kind: "swapped"; url: string; alt: ScoredStream; caps: DeviceCaps; reasons: string[] }
  | {
      kind: "transcode";
      url: string;
      caps: DeviceCaps;
      profile: TranscodeProfile;
      reasons: string[];
    }
  | { kind: "needs-ffmpeg"; caps: DeviceCaps; reasons: string[] }
  | { kind: "incompatible"; caps: DeviceCaps; reasons: string[]; candidatesChecked: number };

// Last-resort profile for forced transcodes that carry no device-specific
// profile (live IPTV, or burning subtitles onto an otherwise-compatible
// stream). Deliberately conservative: 1080p H.264/AAC stereo.
export const UNIVERSAL_SAFE_PROFILE: TranscodeProfile = {
  max_height: 1080,
  force_h264: true,
  force_aac: true,
  force_stereo: true,
  max_video_kbps: 5000,
};

// Choose the transcode profile handed to the backend. When the resolution
// already computed a device-tuned profile (`pickTranscodeProfile`, honouring
// 4K/HEVC/bitrate), we keep it instead of flattening every cast to 1080p
// H.264 — the backend HLS pipeline honours it (see cast_hls). The universal
// safe profile is only a fallback for forced transcodes without one.
export function pickCastTranscodeProfile(
  resolved: CastResolution,
  opts: { forceTranscode: boolean },
): TranscodeProfile | undefined {
  if (resolved.kind === "transcode") return resolved.profile;
  return opts.forceTranscode ? UNIVERSAL_SAFE_PROFILE : undefined;
}

function urlNeedsRemuxForCast(url: string, kind: string): boolean {
  if (kind !== "chromecast" && kind !== "dlna" && kind !== "roku") return false;
  const path = (url.split("?")[0] || "").toLowerCase();
  return (
    path.endsWith(".mp4") ||
    path.endsWith(".m4v") ||
    path.endsWith(".mkv") ||
    path.endsWith(".avi") ||
    path.endsWith(".mov")
  );
}

export async function resolveCompatibleCastUrl(
  src: PlayerSrc,
  device: CastDeviceInfo,
  debrids: ReturnType<typeof useDebridClients>,
  liveDims: { width: number; height: number },
): Promise<CastResolution> {
  const caps = getDeviceCaps(device);
  const augmented = src.streamRef
    ? { ...src.streamRef, liveWidth: liveDims.width, liveHeight: liveDims.height }
    : { liveWidth: liveDims.width, liveHeight: liveDims.height };
  const currentCompat = checkStreamCompat(augmented, caps);
  if (currentCompat.ok) {
    if (urlNeedsRemuxForCast(src.url, device.kind)) {
      const ffmpegOk = await isFfmpegPresent();
      if (ffmpegOk) {
        const profile = pickTranscodeProfile(augmented, caps);
        return {
          kind: "transcode",
          url: src.url,
          caps,
          profile: { ...profile, force_h264: false, force_aac: false },
          reasons: ["remux to MPEGTS for reliable cast playback (avoids moov-atom-at-end issues)"],
        };
      }
    }
    return { kind: "compat", url: src.url, caps };
  }
  const cached = peekPickerCache(src.meta, src.episode);
  const candidates: ScoredStream[] = cached?.result.picker.all ?? [];
  const alt = pickBestCompatStream(candidates, caps);
  if (alt) {
    const ac = new AbortController();
    const r = await resolveStream(alt, debrids, ac.signal, false);
    if (r.ok) {
      let url = r.data.url;
      if (r.data.headers && Object.keys(r.data.headers).length > 0) {
        try {
          const proxied = await registerStreamProxy(r.data.url, r.data.headers);
          url = proxied.url;
        } catch {
          url = "";
        }
      }
      if (url) {
        return { kind: "swapped", url, alt, caps, reasons: currentCompat.reasons };
      }
    }
  }
  const ffmpegOk = await isFfmpegPresent();
  if (ffmpegOk) {
    const profile = pickTranscodeProfile(augmented, caps);
    return {
      kind: "transcode",
      url: src.url,
      caps,
      profile,
      reasons: currentCompat.reasons,
    };
  }
  return {
    kind: "needs-ffmpeg",
    caps,
    reasons: currentCompat.reasons,
  };
}
