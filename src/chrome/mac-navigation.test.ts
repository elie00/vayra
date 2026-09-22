import { describe, expect, it } from "vitest";
import { MAC_EXPLORE_VIEWS, MAC_PRIMARY_VIEWS, isExploreView, sanitizeMacPins } from "./mac-navigation";
import { NAV_ITEMS } from "./nav-items";

describe("Mac navigation contract", () => {
  it("always provides the four main destinations", () => {
    expect(MAC_PRIMARY_VIEWS).toEqual(["home", "discover", "library", "downloads"]);
  });
  it("retains all catalog destinations under Explore", () => {
    for (const view of MAC_EXPLORE_VIEWS) {
      expect(NAV_ITEMS.some((i) => i.view === view)).toBe(true);
      expect(isExploreView(view)).toBe(true);
    }
    expect(isExploreView("settings")).toBe(false);
  });
  it("persists only unique known categories, never arbitrary routes", () => {
    expect(sanitizeMacPins(["anime", "anime", "movies", "settings", "discover", null, "missing"])).toEqual(["anime", "movies"]);
    expect(sanitizeMacPins({ anime: true })).toEqual([]);
  });
});
