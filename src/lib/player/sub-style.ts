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

export async function applySubStyle(s: Settings, assActive = false): Promise<void> {
  const override = s.subAssOverride;
  const assMargins = assActive && override !== "no" ? "yes" : "no";
  const props: Array<[string, unknown]> = [
    ["sub-font-size", 32],
    ["sub-font", mpvFontFor(s.subFontFamily)],
    ["sub-scale", Math.min(4, Math.max(0.4, (Number(s.subFontSize) || 32) / 32))],
    ["sub-color", hexToBgr(s.subFontColor)],
    ["sub-border-color", hexToBgr(s.subBorderColor)],
    ["sub-border-size", s.subBorderSize],
    ["sub-margin-y", s.subMarginY],
    ["sub-align-x", s.subAlignX],
    ["sub-ass-override", override],
    ["sub-ass-force-margins", assMargins],
    ["sub-use-margins", assMargins],
    ["sub-spacing", s.subLineSpacing],
    ["sub-bold", s.subBold ? "yes" : "no"],
  ];
  await Promise.all(
    props.map(([name, value]) =>
      invoke("mpv_set_property", { name, value }).catch(() => {}),
    ),
  );
}
