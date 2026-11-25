import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/lib/settings";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function mpvColor(hex: string, opacity: number): string {
  const rgb = hex.startsWith("#") && hex.length === 7 ? hex.slice(1).toUpperCase() : "FFFFFF";
  const a = Math.round(clamp(opacity, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `#${a}${rgb}`;
}

function mpvFontFor(id: string): string {
  switch (id) {
    case "arabic":
      return "Noto Sans Arabic";
    case "system":
      return "Segoe UI";
    case "serif":
      return "Times New Roman";
    case "rounded":
      return "Segoe UI";
    default:
      return "Inter";
  }
}

export type SubRenderContext = {
  assNativeActive: boolean;
  imageNativeActive: boolean;
  controlsVisible?: boolean;
};

const CONTROLS_MIN_MARGIN_PX = 96;
const CONTROLS_MIN_MARGIN_PCT = 15;

export function computeSubPosition(
  s: Pick<Settings, "subMarginY" | "subAssOverride">,
  context: SubRenderContext = { assNativeActive: false, imageNativeActive: false },
): { marginY: number; pos: number } {
  const baseMarginY = clamp(Number(s.subMarginY) || 0, 0, 100);
  const reposition = !context.assNativeActive || s.subAssOverride !== "no";
  const lifted = Boolean(context.controlsVisible);
  const marginY = lifted ? Math.max(baseMarginY, CONTROLS_MIN_MARGIN_PX) : baseMarginY;
  const posMargin = lifted ? Math.max(baseMarginY, CONTROLS_MIN_MARGIN_PCT) : baseMarginY;
  const pos = reposition ? clamp(100 - posMargin, 0, 100) : 100;
  return { marginY, pos };
}

export async function applySubPositionForControls(
  s: Pick<Settings, "subMarginY" | "subAssOverride">,
  context: SubRenderContext = { assNativeActive: false, imageNativeActive: false },
): Promise<void> {
  const { marginY, pos } = computeSubPosition(s, context);
  const props: Array<[string, unknown]> = [
    ["sub-margin-y", marginY],
    ["sub-pos", pos],
  ];
  await Promise.all(
    props.map(([name, value]) =>
      invoke("mpv_set_property", { name, value }).catch(() => {}),
    ),
  );
}

export async function applySubStyle(
  s: Settings,
  context: SubRenderContext = { assNativeActive: false, imageNativeActive: false },
): Promise<void> {
  const override = s.subAssOverride;
  const assMargins = context.assNativeActive && override !== "no" ? "yes" : "no";
  const { marginY, pos } = computeSubPosition(s, context);
  const opacity = clamp(Number(s.subOpacity ?? 1), 0.1, 1);
  const boxOpacity = clamp(Number(s.subBoxOpacity ?? 0.6), 0, 1);
  const isBox = s.subStyle === "box";
  const isShadow = s.subStyle === "shadow";
  const props: Array<[string, unknown]> = [
    ["sub-font-size", 32],
    ["sub-font", mpvFontFor(s.subFontFamily)],
    ["sub-scale", Math.min(4, Math.max(0.4, (Number(s.subFontSize) || 32) / 32))],
    ["sub-color", mpvColor(s.subFontColor, opacity)],
    ["sub-border-color", mpvColor(s.subBorderColor, opacity)],
    ["sub-border-size", s.subBorderSize],
    ["sub-back-color", isBox ? mpvColor(s.subBoxColor, boxOpacity * opacity) : "#00000000"],
    ["sub-shadow-color", mpvColor("#000000", opacity)],
    ["sub-shadow-offset", isShadow ? 1.4 : 0],
    ["sub-margin-y", marginY],
    ["sub-align-x", s.subAlignX],
    ["sub-ass-override", override],
    ["sub-ass-force-margins", assMargins],
    ["sub-use-margins", assMargins],
    ["sub-spacing", s.subLineSpacing],
    ["sub-bold", s.subBold ? "yes" : "no"],
    ["sub-pos", pos],
  ];
  await Promise.all(
    props.map(([name, value]) =>
      invoke("mpv_set_property", { name, value }).catch(() => {}),
    ),
  );
}
