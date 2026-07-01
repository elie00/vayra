import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/lib/settings";

function hexToBgr(hex: string): string {
  return hex.startsWith("#") && hex.length === 7 ? hex.toUpperCase() : "#FFFFFF";
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
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export async function applySubStyle(
  s: Settings,
  context: SubRenderContext = { assNativeActive: false, imageNativeActive: false },
): Promise<void> {
  const override = s.subAssOverride;
  const assMargins = context.assNativeActive && override !== "no" ? "yes" : "no";
  const subMarginY = clamp(Number(s.subMarginY) || 0, 0, 100);
  const props: Array<[string, unknown]> = [
    ["sub-font-size", 32],
    ["sub-font", mpvFontFor(s.subFontFamily)],
    ["sub-scale", Math.min(4, Math.max(0.4, (Number(s.subFontSize) || 32) / 32))],
    ["sub-color", hexToBgr(s.subFontColor)],
    ["sub-border-color", hexToBgr(s.subBorderColor)],
    ["sub-border-size", s.subBorderSize],
    ["sub-margin-y", subMarginY],
    ["sub-align-x", s.subAlignX],
    ["sub-ass-override", override],
    ["sub-ass-force-margins", assMargins],
    ["sub-use-margins", assMargins],
    ["sub-spacing", s.subLineSpacing],
    ["sub-bold", s.subBold ? "yes" : "no"],
  ];
  if (context.imageNativeActive) {
    props.push(["sub-pos", clamp(100 - subMarginY, 0, 100)]);
  } else {
    props.push(["sub-pos", 100]);
  }
  await Promise.all(
    props.map(([name, value]) =>
      invoke("mpv_set_property", { name, value }).catch(() => {}),
    ),
  );
}
