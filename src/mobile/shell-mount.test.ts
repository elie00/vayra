import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// A merge in July dropped this mount: Android lost its tab bar, its More screen and
// the sheet the topbar's Watch Together button opens, while the CSS still reserved
// room for the bar.
it("mounts the mobile shell on Android", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  expect(app).toContain('import { MobileShell } from "@/mobile/shell";');
  expect(app).toContain("{isMobileTauri() && <MobileShell />}");
});
