import { CastMenu } from "@/components/player/cast-menu";
import { getCastPositionPrecise, useCastPosition } from "@/lib/player/cast-interp";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import type { CastDeviceInfo } from "@/lib/cast";
import type { PlayerSrc } from "@/lib/view";
import { CastErrorModal } from "./cast-error-modal";
import { CastSessionBar } from "./cast-session-bar";
import { CastingOverlay } from "./casting-overlay";
import type { PlayerCastController } from "./hooks/use-player-cast";

/**
 * Isolates the 1 Hz cast-position subscription to this tiny wrapper so only the
 * progress bar re-renders each tick — not CastLayer or the player subtree.
 */
function LiveCastSessionBar({
  device,
  playing,
  durationSec,
  onTogglePlay,
  onStop,
  onSeek,
  transcoding,
}: {
  device: CastDeviceInfo;
  playing: boolean;
  durationSec: number;
  onTogglePlay: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onSeek: (sec: number) => void | Promise<void>;
  transcoding?: boolean;
}) {
  // Subscribe to the floored second only to drive a ~1 Hz re-render (cheap), but
  // pass the *precise* float position downstream so the ±15 s seek buttons don't
  // lose up to a second to flooring. The `> 0` guard (not the falsy floored
  // value) keeps the local-playback fallback confined to the pre-cast window.
  const flooredSec = useCastPosition();
  const precise = getCastPositionPrecise();
  const positionSec = precise > 0 ? precise : flooredSec || getPlaybackPosition();
  return (
    <CastSessionBar
      device={device}
      playing={playing}
      positionSec={positionSec}
      durationSec={durationSec}
      onTogglePlay={onTogglePlay}
      onStop={onStop}
      onSeek={onSeek}
      transcoding={transcoding}
    />
  );
}

export function CastLayer({
  cast,
  src,
  durationSec,
  hasActiveSub,
  onPickAnother,
}: {
  cast: PlayerCastController;
  src: PlayerSrc;
  durationSec: number;
  hasActiveSub: boolean;
  onPickAnother: () => void;
}) {
  return (
    <>
      <CastMenu
        open={cast.castMenuOpen}
        anchor={cast.castMenuAnchor}
        onClose={cast.closeCastMenu}
        onPick={cast.onPickDevice}
        hasActiveSub={hasActiveSub}
        burnSubsOnTv={cast.burnSubsOnTv}
        setBurnSubsOnTv={cast.setBurnSubsOnTv}
      />
      {cast.pendingCastDevice && !cast.castDevice && (
        <CastingOverlay
          device={cast.pendingCastDevice}
          title={src.title}
          poster={src.meta.poster}
          playing={false}
          connecting
        />
      )}
      {cast.castDevice && (
        <>
          <CastingOverlay
            device={cast.castDevice}
            title={src.title}
            poster={src.meta.poster}
            playing={cast.castPlaying}
          />
          <LiveCastSessionBar
            device={cast.castDevice}
            playing={cast.castPlaying}
            durationSec={durationSec}
            onTogglePlay={cast.togglePlayCast}
            onStop={() => {
              cast.setCastTranscoding(false);
              return cast.stopCast();
            }}
            onSeek={cast.seekCast}
            transcoding={cast.castTranscoding}
          />
        </>
      )}
      {cast.castError && (
        <div className="pointer-events-none absolute end-6 top-20 z-20 rounded-xl border border-rose-300/40 bg-rose-400/15 px-4 py-2 text-[12.5px] text-rose-100">
          {cast.castError}
        </div>
      )}
      <CastErrorModal error={cast.castErrorInfo} onDismiss={cast.dismissCastErrorInfo} />
      {cast.castIncompatError && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-30 flex max-w-[520px] -translate-x-1/2 items-start gap-3 rounded-2xl border border-info/40 bg-info/15 px-4 py-3 text-[12.5px] leading-relaxed text-info shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <span className="flex-1">{cast.castIncompatError}</span>
          <button
            type="button"
            onClick={() => {
              cast.setCastIncompatError(null);
              onPickAnother();
            }}
            className="shrink-0 rounded-full bg-info/30 px-3 py-1 text-[11.5px] font-semibold text-info hover:bg-info/50"
          >
            Pick another
          </button>
          <button
            type="button"
            onClick={() => cast.setCastIncompatError(null)}
            className="shrink-0 rounded-full px-2 py-1 text-[11.5px] font-medium text-info/80 hover:text-info"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
