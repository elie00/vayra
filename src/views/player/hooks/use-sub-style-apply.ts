import { useEffect, useRef } from "react";
import { isLinuxDesktop, isMacDesktop } from "@/lib/platform";
import { applyMotionInterp } from "@/lib/player/motion-interp";
import { applyRtxHdr } from "@/lib/player/rtx-hdr";
import { applySubPositionForControls, applySubStyle } from "@/lib/player/sub-style";
import type { useSettings } from "@/lib/settings";

export function useSubStyleApply(params: {
  engine: "html5" | "mpv" | "exo";
  settings: ReturnType<typeof useSettings>["settings"];
  assNativeActive: boolean;
  imageNativeActive: boolean;
  controlsVisible?: boolean;
  bridgeReady: boolean;
  mediaReady: boolean;
  bridgeKey: string | number;
}) {
  const {
    engine,
    settings,
    assNativeActive,
    imageNativeActive,
    controlsVisible = false,
    bridgeReady,
    mediaReady,
    bridgeKey,
  } = params;

  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;

  useEffect(() => {
    if (engine !== "mpv") return;
    if (!bridgeReady) return;
    if (!mediaReady) return;
    void applySubStyle(settings, {
      assNativeActive,
      imageNativeActive,
      controlsVisible: controlsVisibleRef.current,
    });
  }, [engine, bridgeReady, mediaReady, bridgeKey, assNativeActive, imageNativeActive, settings.subFontSize, settings.subFontColor, settings.subBorderColor, settings.subBorderSize, settings.subMarginY, settings.subAlignX, settings.subAssOverride, settings.subStyle, settings.subFontFamily, settings.subLineSpacing, settings.subOpacity, settings.subBoxOpacity, settings.subBoxColor, settings.subBold, settings]);

  useEffect(() => {
    if (engine !== "mpv") return;
    if (!bridgeReady) return;
    if (!mediaReady) return;
    void applySubPositionForControls(settings, {
      assNativeActive,
      imageNativeActive,
      controlsVisible,
    });
  }, [engine, bridgeReady, mediaReady, bridgeKey, assNativeActive, imageNativeActive, controlsVisible, settings.subMarginY, settings.subAssOverride, settings]);

  useEffect(() => {
    if (engine !== "mpv") return;
    if ((isMacDesktop() || isLinuxDesktop()) && settings.playerMpvEmbed) return;
    if (!bridgeReady) return;
    const svpActive = settings.playerSvp && !!settings.svpVpyPath;
    void applyMotionInterp(settings.playerMotionInterp && !svpActive);
    void applyRtxHdr(settings.playerRtxHdr, svpActive);
  }, [
    engine,
    bridgeReady,
    bridgeKey,
    settings.playerMpvEmbed,
    settings.playerMotionInterp,
    settings.playerRtxHdr,
    settings.playerSvp,
    settings.svpVpyPath,
  ]);
}
