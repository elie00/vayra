import { describe, expect, it } from "vitest";
import { playerEscapeAction } from "./escape-action";
import { DEFAULT } from "@/lib/settings/defaults";

describe("Escape in the player", () => {
  it("leaves fullscreen before closing the video, by default", () => {
    const opts = { escExitsFullscreen: DEFAULT.playerEscExitsFullscreen, confirmLeave: false };
    expect(playerEscapeAction({ ...opts, fullscreen: true })).toBe("exit-fullscreen");
    expect(playerEscapeAction({ ...opts, fullscreen: false })).toBe("close");
  });

  it("asks before leaving once out of fullscreen when confirmation is on", () => {
    expect(playerEscapeAction({ fullscreen: false, escExitsFullscreen: true, confirmLeave: true })).toBe("confirm-leave");
  });

  it("closes directly from fullscreen only when the preference is turned off", () => {
    expect(playerEscapeAction({ fullscreen: true, escExitsFullscreen: false, confirmLeave: false })).toBe("close");
  });
});
