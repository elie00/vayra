import { useEffect } from "react";
import { isLinuxDesktop, isMacDesktop } from "@/lib/platform";
import { applyMotionInterp } from "@/lib/player/motion-interp";
import { applySubStyle } from "@/lib/player/sub-style";
import type { useSettings } from "@/lib/settings";

export function useSubStyleApply(params: {
  engine: "html5" | "mpv";
  settings: ReturnType<typeof useSettings>["settings"];
  assNativeActive: boolean;
  imageNativeActive: boolean;
  bridgeReady: boolean;
  bridgeKey: string | number;
}) {
  const { engine, settings, assNativeActive, imageNativeActive, bridgeReady, bridgeKey } = params;

  useEffect(() => {
    if (engine !== "mpv") return;
    if (!bridgeReady) return;
    void applySubStyle(settings, { assNativeActive, imageNativeActive });
  }, [
    engine,
    bridgeReady,
    bridgeKey,
    assNativeActive,
    imageNativeActive,
    settings.subFontSize,
    settings.subFontColor,
    settings.subBorderColor,
    settings.subBorderSize,
    settings.subMarginY,
    settings.subAlignX,
    settings.subAssOverride,
    settings.subStyle,
    settings.subFontFamily,
    settings.subLineSpacing,
  ]);

  useEffect(() => {
    if (engine !== "mpv") return;
    if ((isMacDesktop() || isLinuxDesktop()) && settings.playerMpvEmbed) return;
    if (!bridgeReady) return;
    const svpActive = settings.playerSvp && !!settings.svpVpyPath;
    void applyMotionInterp(settings.playerMotionInterp && !svpActive);
  }, [
    engine,
    bridgeReady,
    bridgeKey,
    settings.playerMpvEmbed,
    settings.playerMotionInterp,
    settings.playerSvp,
    settings.svpVpyPath,
  ]);
}
