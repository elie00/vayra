import { describe, expect, it } from "vitest";
import type { Addon } from "@/lib/addons";
import {
  hasLiteDebridCredential,
  liteHttpStreamTransportUrl,
  liteStarterAddons,
  mergeLiteStarterAddons,
} from "./addon-pack";

describe("VAYRA Lite addon pack", () => {
  it("ships discovery, availability, subtitles and browser streams without setup", () => {
    const addons = liteStarterAddons({});

    expect(addons.map((addon) => addon.manifest.id)).toEqual([
      "com.linvo.cinemeta",
      "org.stremio.watchhub",
      "org.stremio.opensubtitlesv3",
      "webstreamr-mbg",
    ]);
  });

  it("configures the HTTP stream addon for Lite's fallback languages", () => {
    const url = decodeURIComponent(liteHttpStreamTransportUrl(["Italian"]));

    expect(url).toContain('"multi":"on"');
    expect(url).toContain('"en":"on"');
    expect(url).toContain('"fr":"on"');
    expect(url).toContain('"it":"on"');
  });

  it("adds a ready-to-use stream addon only when debrid is configured", () => {
    expect(hasLiteDebridCredential({ rdKey: "  " })).toBe(false);
    expect(hasLiteDebridCredential({ rdKey: "rd-secret" })).toBe(true);

    const addons = liteStarterAddons({ rdKey: "rd-secret" }, ["French"]);
    const torrentio = addons.find(
      (addon) => addon.manifest.id === "com.stremio.torrentio.addon",
    );

    expect(torrentio?.transportUrl).toContain("language=french");
    expect(torrentio?.transportUrl).toContain("realdebrid=rd-secret");
  });

  it("preserves account configuration and never duplicates a managed addon", () => {
    const accountWatchHub: Addon = {
      transportUrl: "https://account.example/watchhub/manifest.json",
      manifest: {
        id: "org.stremio.watchhub",
        name: "My WatchHub",
        resources: ["stream"],
      },
    };

    const merged = mergeLiteStarterAddons([accountWatchHub], {});

    expect(merged.filter((addon) => addon.manifest.id === "org.stremio.watchhub")).toEqual([
      accountWatchHub,
    ]);
    expect(merged).toHaveLength(4);
  });
});
