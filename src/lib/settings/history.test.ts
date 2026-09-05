import { expect, it } from "vitest";
import { checkpointPatch, historyPreferences } from "./history";
import { DEFAULT } from "./defaults";
it("allowlists preferences instead of attempting to blacklist every credential", () => {
  const settings = { ...DEFAULT, rdKey: "SECRET", theme: { ...DEFAULT.theme, backgroundImage: "https://secret.invalid/token" } };
  const text = JSON.stringify(historyPreferences(settings));
  expect(text).not.toContain("SECRET"); expect(text).not.toContain("secret.invalid");
  expect(text).toContain("preferredSubLangs");
});
it("restores only preferences and preserves current backgrounds and credentials", () => {
  const current = { ...DEFAULT, rdKey: "CURRENT", theme: { ...DEFAULT.theme, backgroundImage: "current-image" } };
  const patch = checkpointPatch({ savedAt: 1, settings: { rdKey: "OLD", instantPlay: !current.instantPlay, theme: { preset: "sage", backgroundImage: "old-image" } } }, current);
  expect(patch.rdKey).toBeUndefined(); expect(patch.instantPlay).toBe(!current.instantPlay);
  expect(patch.theme?.backgroundImage).toBe("current-image");
});
