import { describe, expect, it } from "vitest";
import { buildCatchupUrl, detectCatchupType } from "./catchup";
import { deriveEpgUrls, groupChannels, parseM3u } from "./m3u";
import type { IptvChannel } from "./types";

function channel(overrides: Partial<IptvChannel>): IptvChannel {
  return {
    id: "channel",
    tvgId: null,
    name: "Channel",
    logo: null,
    group: null,
    url: "https://tv.example/live.m3u8",
    catchupSource: null,
    durationSec: null,
    attrs: {},
    ...overrides,
  };
}

describe("M3U parsing and IPTV catch-up", () => {
  it("parses quoted attributes, sticky groups and playback headers", () => {
    const parsed = parseM3u(`\uFEFF#EXTM3U
#EXTGRP:News
#EXTINF:-1 tvg-id="news.fr" tvg-name="France News, HD" tvg-logo="https://img/logo.png",Fallback
#EXTVLCOPT:http-user-agent=Harbor Player
https://tv.example/news.m3u8|Referer=https%3A%2F%2Fportal.example&Cookie=session%3Dabc
#EXTINF:120 tvg-name="----",----
https://tv.example/divider`, "playlist");

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      tvgId: "news.fr",
      name: "France News, HD",
      group: "News",
      durationSec: null,
      url: "https://tv.example/news.m3u8",
      attrs: {
        "vlcopt-user-agent": "Harbor Player",
        "vlcopt-referrer": "https://portal.example",
        "vlcopt-cookie": "session=abc",
      },
    });
    expect(groupChannels(parsed).get("News")).toEqual(parsed);
  });

  it("derives encoded XMLTV endpoints only from valid Xtream playlists", () => {
    expect(deriveEpgUrls("https://iptv.example/get.php?username=a%2Bb&password=p%26q")).toEqual([
      "https://iptv.example/xmltv.php?username=a%2Bb&password=p%26q",
      "https://iptv.example/get.php?username=a%2Bb&password=p%26q&type=epg",
    ]);
    expect(deriveEpgUrls("https://iptv.example/playlist.m3u")).toEqual([]);
    expect(deriveEpgUrls("not a url")).toEqual([]);
  });

  it("builds deterministic template and Xtream catch-up URLs", () => {
    const start = Date.UTC(2025, 0, 2, 3, 4, 5);
    const end = start + 90_000;
    const now = start + 3_600_000;
    const templated = channel({
      attrs: { catchup: "default" },
      catchupSource: "?start=${start}&end={end}&stamp={utc:Y-m-d:H-M-S}&duration={duration}",
    });
    expect(buildCatchupUrl(templated, start, end, now)).toBe(
      "https://tv.example/live.m3u8?start=1735787045&end=1735787135&stamp=2025-01-02:03-04-05&duration=90",
    );

    const xtream = channel({ url: "https://iptv.example/live/user/pass/42.m3u8" });
    expect(detectCatchupType(xtream)).toBe("xtream");
    expect(buildCatchupUrl(xtream, start, end, now)).toBe(
      "https://iptv.example/timeshift/user/pass/2/2025-01-02:03-04/42.ts",
    );
  });

  it("preserves query strings for Flussonic archives and enforces a 60s minimum", () => {
    const flussonic = channel({
      url: "https://tv.example/channel/index.m3u8?token=secret",
      attrs: { catchup: "flussonic" },
    });
    expect(buildCatchupUrl(flussonic, 1_000_000, 1_010_000, 2_000_000)).toBe(
      "https://tv.example/channel/index-1000-60.m3u8?token=secret",
    );
  });
});
