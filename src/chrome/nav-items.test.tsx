import { describe, expect, it } from "vitest";
import {
  COLLECTION_NAV_ITEMS,
  NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  STANDARD_NAV_ITEMS,
} from "./nav-items";

describe("canonical chrome navigation", () => {
  it("keeps every item id and destination unique", () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    const views = NAV_ITEMS.map((item) => item.view);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(views).size).toBe(views.length);
  });

  it("includes the complete standard navigation contract", () => {
    expect(STANDARD_NAV_ITEMS.map((item) => item.view)).toEqual([
      "home",
      "discover",
      "movies",
      "shows",
      "anime",
      "live",
      "sports",
      "vod",
      "calendar",
      "library",
      "downloads",
      "addons",
      "settings",
    ]);
  });

  it("keeps contextual views out of every standard chrome", () => {
    expect(PRIMARY_NAV_ITEMS.every((item) => item.section === "primary")).toBe(true);
    expect(COLLECTION_NAV_ITEMS.map((item) => item.view)).toEqual([
      "calendar",
      "library",
      "downloads",
      "addons",
      "settings",
    ]);
    expect(STANDARD_NAV_ITEMS.some((item) => item.view === "kids")).toBe(false);
    expect(STANDARD_NAV_ITEMS.some((item) => item.view === "catalogs")).toBe(false);
  });
});
