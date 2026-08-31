import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "@/lib/platform-capabilities";
import { tabAvailable } from "./library/tab-availability";

describe("library tabs by platform", () => {
  it("keeps the Local tab on desktop", () => {
    expect(tabAvailable("local", capabilitiesFor("desktop"))).toBe(true);
  });

  it("hides the Local tab where there are no local files to scan", () => {
    // Scanning a folder goes through the backend; a browser has no equivalent,
    // so the tab could only ever fail there.
    expect(tabAvailable("local", capabilitiesFor("web"))).toBe(false);
    expect(tabAvailable("local", capabilitiesFor("mobile-native"))).toBe(false);
  });

  it("leaves the service tabs alone on every platform", () => {
    for (const platform of ["desktop", "web", "mobile-native"] as const) {
      const caps = capabilitiesFor(platform);
      for (const tab of ["watchlist", "history", "trakt", "simkl", "mal", "lists", "letterboxd"] as const) {
        expect(tabAvailable(tab, caps)).toBe(true);
      }
    }
  });
})
