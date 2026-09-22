import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
// @ts-expect-error Build-time source scanner is a Node-only ES module.
import { collectDisplayKeys, collectTranslationKeys } from "../../../../scripts/i18n-source-keys.mjs";
import fr from "./fr";
import en from "./en";
import { BETA_THEMES, FEATURED_CUSTOM_THEMES, FONT_PAIRS, TEMPLATE_THEMES, THEME_PRESETS } from "../../theme";
import { STARTER_GALLERY_THEMES } from "../../../components/theme-gallery-data";

describe("French application coverage", () => {
  const keys: string[] = [
    ...collectTranslationKeys(fileURLToPath(new URL("../../../", import.meta.url))),
    ...collectDisplayKeys(["../../../views/settings.tsx", "../../../views/settings/nav.tsx"].map((path) => fileURLToPath(new URL(path, import.meta.url)))),
    ...[...Object.values(THEME_PRESETS), ...BETA_THEMES, ...FEATURED_CUSTOM_THEMES, ...TEMPLATE_THEMES,
      ...Object.values(FONT_PAIRS), ...STARTER_GALLERY_THEMES].map((entry) => entry.blurb),
    "VAYRA default", "Obsidian", "Sage", "Ivory", "System UI",
    "Built-in", "Featured", "Template", "Yours",
  ];

  it("translates every literal app translation key, not only the English catalog", () => {
    expect(keys.filter((key) => !fr[key])).toEqual([]);
  });

  it("preserves interpolation variables in app translations", () => {
    const variables = (text: string) => [...new Set(text.match(/\{[\w]+\}/g) ?? [])].sort();
    const mismatches = keys.filter((key) => fr[key] && JSON.stringify(variables(en[key] ?? key)) !== JSON.stringify(variables(fr[key])));
    expect(mismatches).toEqual([]);
  });
});
