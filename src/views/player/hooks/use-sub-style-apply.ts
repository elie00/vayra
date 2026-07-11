import { useEffect, type RefObject } from "react";
import { isLinuxDesktop, isMacDesktop } from "@/lib/platform";
import { applyMotionInterp } from "@/lib/player/motion-interp";
import { applySubStyle } from "@/lib/player/sub-style";
import type { PlayerBridge } from "@/lib/player/bridge";
import type { useSettings } from "@/lib/settings";

type Settings = ReturnType<typeof useSettings>["settings"];

// Best-effort mapping of Harbor's subtitle style onto media3's setSubStyle for
// EMBEDDED tracks (external subs use the JS overlay, which honours every
// setting). Font family, vertical margin, horizontal alignment, bold, line
// spacing, text/box opacity and ASS overrides have no media3 equivalent here.
function exoSubStyle(s: Settings) {
  return {
    fgColor: s.subFontColor,
    bgColor: s.subStyle === "box" ? s.subBoxColor : "#00000000",
    edge: s.subStyle === "shadow" ? "shadow" : s.subStyle === "outline" ? "outline" : "none",
    sizeFraction: Math.max(0.02, Math.min(0.2, ((Number(s.subFontSize) || 32) / 32) * 0.06)),
  } as const;
}

export function useSubStyleApply(params: {
  engine: "html5" | "mpv" | "exo";
  settings: Settings;
  subAssNative: boolean;
  bridgeReady: boolean;
  bridgeKey: string | number;
  bridgeRef?: RefObject<PlayerBridge | null>;
}) {
  const { engine, settings, subAssNative, bridgeReady, bridgeKey, bridgeRef } = params;

  useEffect(() => {
    if (engine !== "exo" || !bridgeReady) return;
    bridgeRef?.current?.setSubStyle?.(exoSubStyle(settings));
  }, [engine, bridgeReady, bridgeRef, settings]);

  useEffect(() => {
    if (engine !== "mpv") return;
    void applySubStyle(settings, subAssNative);
  }, [engine, subAssNative, settings.subFontSize, settings.subFontColor, settings.subBorderColor, settings.subBorderSize, settings.subMarginY, settings.subAlignX, settings.subAssOverride, settings.subStyle, settings.subFontFamily, settings.subLineSpacing, settings]);

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
