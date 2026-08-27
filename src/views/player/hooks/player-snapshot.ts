import type { PlayerSnapshot } from "@/lib/player/bridge";

export function snapChangedIgnoringClock(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  return (
    a.status !== b.status ||
    a.buffering !== b.buffering ||
    a.durationSec !== b.durationSec ||
    a.volume !== b.volume ||
    a.muted !== b.muted ||
    a.rate !== b.rate ||
    a.audioTracks !== b.audioTracks ||
    a.subtitleTracks !== b.subtitleTracks ||
    a.chapters !== b.chapters ||
    a.subDelaySec !== b.subDelaySec ||
    a.audioDelaySec !== b.audioDelaySec ||
    a.subText !== b.subText ||
    a.subStartSec !== b.subStartSec ||
    a.audioNormalize !== b.audioNormalize ||
    a.videoWidth !== b.videoWidth ||
    a.videoHeight !== b.videoHeight ||
    a.hdrGamma !== b.hdrGamma ||
    a.errorMessage !== b.errorMessage ||
    a.errorCode !== b.errorCode
  );
}
