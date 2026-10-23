import { useEffect, useMemo, type RefObject } from "react";
import {
  getCastPositionPrecise,
  subscribeCastPosition,
} from "@/lib/player/cast-interp";
import type { CastSubStyle } from "@/lib/cast";
import { useDebridClients } from "@/lib/debrid/registry";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import {
  getPlaybackBuffered,
  getPlaybackPosition,
  setPlaybackClock,
} from "@/lib/player/playback-clock";
import type { Settings } from "@/lib/settings";
import type { PlayerSrc } from "@/lib/view";
import { buildCastSubStyle, useCastPick } from "./use-cast-pick";
import { useCastSession } from "./use-cast-session";

// Each TV subtitle change reloads the cast: wait for the user to settle on a value.
const CAST_RESTYLE_DELAY_MS = 1200;

export function usePlayerCast(params: {
  src: PlayerSrc;
  debrids: ReturnType<typeof useDebridClients>;
  snapRef: RefObject<PlayerSnapshot>;
  bridgeRef: RefObject<PlayerBridge | null>;
  settings: Settings;
}) {
  const { src, debrids, snapRef, bridgeRef, settings } = params;
  const session = useCastSession(bridgeRef);
  const pick = useCastPick({
    src,
    debrids,
    snapRef,
    bridgeRef,
    settings,
    burnSubsOnTv: session.burnSubsOnTv,
    closeCastMenu: session.closeCastMenu,
    pickCastDevice: session.pickCastDevice,
    setCastErrorInfo: session.setCastErrorInfo,
  });

  // While casting, mirror the (ref-based) cast position into the playback clock
  // so out-of-scope consumers — scrobbling, resume autosave, room sync — keep
  // reading the live position via getPlaybackPosition(). This subscription lives
  // outside React state, so it does not re-render the player subtree.
  const castActive = session.castDevice != null;
  useEffect(() => {
    if (!castActive) return;
    const push = () => {
      // Use the precise float (not the floored display snapshot) so out-of-scope
      // consumers — scrobbling, resume autosave, room sync — keep sub-second
      // position accuracy instead of a value truncated to the whole second.
      const pos = getCastPositionPrecise();
      setPlaybackClock(pos > 0 ? pos : getPlaybackPosition(), getPlaybackBuffered());
    };
    push();
    return subscribeCastPosition(push);
  }, [castActive]);

  const { castDevice, castSubStyleKey, castRestyling, restyleCast } = session;
  const wantedSubStyleKey = JSON.stringify(buildCastSubStyle(settings));
  const castSubStylePending = castSubStyleKey != null && castSubStyleKey !== wantedSubStyleKey;
  useEffect(() => {
    if (!castDevice || !castSubStylePending || castRestyling) return;
    const timer = window.setTimeout(
      () => void restyleCast(JSON.parse(wantedSubStyleKey) as CastSubStyle),
      CAST_RESTYLE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [castDevice, castSubStylePending, castRestyling, wantedSubStyleKey, restyleCast]);

  const sync = useMemo(
    () => ({
      activeRef: session.castActiveRef,
      engagedRef: session.castEngagedRef,
      play: session.playCast,
      pause: session.pauseCast,
      seek: session.seekCast,
      getPosition: session.getCastPosition,
      isPlaying: session.isCastPlaying,
    }),
    [session.castActiveRef, session.castEngagedRef, session.playCast, session.pauseCast, session.seekCast, session.getCastPosition, session.isCastPlaying],
  );

  return { ...session, ...pick, castSubStylePending, sync };
}

export type PlayerCastController = ReturnType<typeof usePlayerCast>;
