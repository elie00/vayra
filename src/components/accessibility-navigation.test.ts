import { describe, expect, it } from "vitest";
import { announcementForView } from "./accessibility-navigation";

const translate = (key: string) => ({ "nav.home": "Accueil", "nav.settings": "Réglages" })[key] ?? key;

describe("accessible view announcement", () => {
  it("prefers the current media title for layered views", () => {
    expect(announcementForView("player", "  North Line  ", translate)).toBe("North Line");
  });

  it("uses localized labels for primary views", () => {
    expect(announcementForView("home", undefined, translate)).toBe("Accueil");
    expect(announcementForView("settings", undefined, translate)).toBe("Réglages");
  });

  it("keeps unknown view names understandable", () => {
    expect(announcementForView("episode-detail", undefined, translate)).toBe("episode detail");
  });
});
