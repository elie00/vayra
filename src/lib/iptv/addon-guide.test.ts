import { describe, expect, it, vi } from "vitest";
import type { Addon } from "@/lib/addons";
import type { Meta } from "@/lib/cinemeta";
import {
  epgAddonSources,
  fetchGuideDay,
  guideFromMetas,
  resolveAddonChannelStream,
  utcDatesForWindow,
} from "./addon-guide";

function addon(overrides: Partial<Addon["manifest"]> = {}): Addon {
  return {
    transportUrl: "https://tv.example/manifest.json",
    manifest: {
      id: "org.example.livetv",
      name: "Example Live TV",
      types: ["tv"],
      catalogs: [{ type: "tv", id: "channels", name: "Channels", extra: [{ name: "skip" }, { name: "date" }] }],
      behaviorHints: { epgProvider: true },
      ...overrides,
    },
  };
}

function channel(id: string, videos: Meta["videos"]): Meta {
  return { id, type: "tv", name: id.toUpperCase(), poster: `https://img/${id}.png`, videos, behaviorHints: { isLive: true, hasScheduledVideos: true } };
}

describe("epgAddonSources", () => {
  it("offers each guide catalog of an EPG provider as a Live source", () => {
    const [src] = epgAddonSources([addon()]);
    expect(src).toMatchObject({
      kind: "addon",
      name: "Example Live TV",
      addon: { base: "https://tv.example", catalogId: "channels", type: "tv" },
    });
  });

  it("ignores addons that do not declare epgProvider or a date-aware tv catalog", () => {
    expect(epgAddonSources([addon({ behaviorHints: {} })])).toEqual([]);
    expect(epgAddonSources([addon({ catalogs: [{ type: "tv", id: "channels", name: "Channels", extra: [{ name: "skip" }] }] })])).toEqual([]);
  });
});

describe("utcDatesForWindow", () => {
  it("asks for every UTC day the visible window overlaps", () => {
    expect(utcDatesForWindow(Date.parse("2026-09-23T20:00:00Z"), Date.parse("2026-09-24T04:00:00Z"))).toEqual(["2026-09-23", "2026-09-24"]);
    expect(utcDatesForWindow(Date.parse("2026-09-23T08:00:00Z"), Date.parse("2026-09-23T16:00:00Z"))).toEqual(["2026-09-23"]);
  });
});

describe("fetchGuideDay", () => {
  it("pages with skip until an empty metasDetailed page", async () => {
    const pages = [[channel("a", []), channel("b", [])], [channel("c", [])], []];
    const fetchJson = vi.fn(async (_url: string) => ({ metasDetailed: pages.shift() }));
    const metas = await fetchGuideDay(fetchJson, "https://tv.example", "tv", "channels", "2026-09-23");
    expect(metas.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(fetchJson.mock.calls.map((c) => c[0])).toEqual([
      "https://tv.example/catalog/tv/channels/date=2026-09-23.json",
      "https://tv.example/catalog/tv/channels/date=2026-09-23&skip=2.json",
      "https://tv.example/catalog/tv/channels/date=2026-09-23&skip=3.json",
    ]);
  });

  it("stops on a failed page instead of looping", async () => {
    const fetchJson = vi.fn(async () => null);
    expect(await fetchGuideDay(fetchJson, "https://tv.example", "tv", "channels", "2026-09-23")).toEqual([]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
});

describe("guideFromMetas", () => {
  const [src] = epgAddonSources([addon()]);
  const news = { id: "p1", title: "Evening News", startTime: "2026-09-23T18:00:00.000Z", endTime: "2026-09-23T18:45:00.000Z" };
  const film = { id: "p2", title: "Film", startTime: "2026-09-23T18:45:00.000Z", endTime: "2026-09-23T20:30:00.000Z" };

  it("turns channels into playable Live channels and their programmes into the EPG, merging days", () => {
    const { playlist, epg } = guideFromMetas(src, [channel("tv:news", [news]), channel("tv:news", [film, news])], 1000);
    expect(playlist.channels).toHaveLength(1);
    const ch = playlist.channels[0];
    expect(ch).toMatchObject({ name: "TV:NEWS", logo: "https://img/tv:news.png", group: "Example Live TV" });
    expect(ch.attrs).toMatchObject({ "addon-base": "https://tv.example", "addon-channel-id": "tv:news", "addon-type": "tv" });
    expect(epg.byChannel.get(ch.tvgId!)!.map((p) => p.title)).toEqual(["Evening News", "Film"]);
  });
});

describe("resolveAddonChannelStream", () => {
  it("asks the addon for the channel's streams and plays the first with a URL", async () => {
    const [src] = epgAddonSources([addon()]);
    const { playlist } = guideFromMetas(src, [channel("tv:news", [])], 1000);
    const fetchJson = vi.fn(async () => ({ streams: [{ name: "torrent", infoHash: "x" }, { name: "HLS", url: "https://cdn/news.m3u8" }] }));
    expect(await resolveAddonChannelStream(fetchJson, playlist.channels[0])).toEqual({ url: "https://cdn/news.m3u8", headers: undefined });
    expect(fetchJson).toHaveBeenCalledWith("https://tv.example/stream/tv/tv%3Anews.json");
  });
});
