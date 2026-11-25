import { describe, expect, it } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import {
  classifyStreams,
  extractReleaseMeta,
  formatStreamLanguages,
  groupPlayableByQuality,
  normalizeLanguageToIso,
  pickBestPlayable,
} from "./stream-presentation";

function makeStream(overrides: Partial<ScoredStream> = {}): ScoredStream {
  return {
    addonId: "com.stremio.torrentio.addon",
    addonName: "Torrentio",
    infoHash: "abcdef1234567890abcdef1234567890abcdef12",
    parsedTitle: "Nocturne",
    episodeTitle: null,
    resolution: "1080p",
    hdrFormat: null,
    codec: "HEVC",
    source: "WEB-DL",
    audio: { codec: "DD+", channels: 6 },
    audioLanguages: [],
    size: 4 * 1024 ** 3,
    seeders: 42,
    cached: {},
    inLibrary: {},
    container: "mkv",
    releaseGroup: "NTb",
    releaseGroupNormalized: "ntb",
    remux: false,
    edition: null,
    year: 2020,
    yearRange: null,
    season: null,
    episode: null,
    seasonPack: false,
    discIndex: null,
    repackIteration: 0,
    proper: false,
    hardcoded: false,
    animeHash: null,
    scamScore: 0,
    score: 100,
    reasons: [],
    tier: "1080p",
    ...overrides,
  };
}

describe("classifyStreams", () => {
  it("detects Orion API key error cards and separates them from playable and external streams", () => {
    const orionError = makeStream({
      addonId: "com.orionoid.stremio",
      addonName: "Orion",
      infoHash: undefined,
      url: undefined,
      externalUrl: "https://panel.orionoid.com",
      name: "Orion\n⚠️ ERROR!",
      title: "Invalid User API Key",
      size: null,
      seeders: null,
      parsedTitle: "",
    });
    const pearioExternal = makeStream({
      addonId: "community.peario",
      addonName: "Peario",
      infoHash: undefined,
      url: undefined,
      externalUrl: "https://peario.xyz/watch?id=tt11044858",
      name: "Peario",
      title: "Watch together on Peario",
      size: null,
      seeders: null,
    });
    const torrentioPlayable = makeStream({
      name: "Torrentio\n4k HDR",
      title: "Nocturne.2020.2160p.AMZN.WEB-DL.DDP5.1.H.265-NTb.mkv\n👤 81 💾 8.61 GB ⚙️ EXT",
      resolution: "4K",
    });

    const result = classifyStreams([orionError, pearioExternal, torrentioPlayable]);

    expect(result.playable).toEqual([torrentioPlayable]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].addonName).toBe("Orion");
    expect(result.errors[0].message).toContain("Invalid User API Key");
    expect(result.errors[0].message).not.toContain("⚠️");

    expect(result.external).toHaveLength(1);
    expect(result.external[0]).toEqual({
      stream: pearioExternal,
      addonName: "Peario",
      label: "Watch together on Peario",
      url: "https://peario.xyz/watch?id=tt11044858",
    });
  });

  it("does NOT misclassify legitimate movies or episodes with 'Error' in the title", () => {
    const fatalErrorTorrent = makeStream({
      name: "Torrentio\n1080p",
      title: "Fatal.Error.1999.1080p.BluRay.x264-GROUP.mkv\n👤 25 💾 7.20 GB ⚙️ 1337x",
      parsedTitle: "Fatal Error",
      size: Math.round(7.2 * 1024 ** 3),
      seeders: 25,
    });
    const trialAndErrorHttp = makeStream({
      addonId: "org.example.direct",
      addonName: "Direct",
      infoHash: undefined,
      url: "https://cdn.example.com/trial-and-error-s01e01.mp4",
      name: "Trial and Error S01E01",
      title: "Trial and Error — Pilot",
      size: null,
      seeders: null,
    });
    const youtubeStream = makeStream({
      addonId: "com.youtube",
      addonName: "YouTube",
      infoHash: undefined,
      url: undefined,
      ytId: "abc123XYZ",
      name: "Comedy of Errors (Full Movie)",
      size: null,
      seeders: null,
    });
    const localStream = makeStream({
      addonId: "local",
      addonName: "Local",
      infoHash: undefined,
      url: "/Users/eybo/Movies/System.Error.2022.1080p.mkv",
      name: "System Error",
      size: null,
      seeders: null,
    });

    const result = classifyStreams([
      fatalErrorTorrent,
      trialAndErrorHttp,
      youtubeStream,
      localStream,
    ]);

    expect(result.playable).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
    expect(result.external).toHaveLength(0);
  });

  it("detects addon error notices even when they include a dummy URL without media metrics", () => {
    const notConfigured = makeStream({
      addonId: "com.someaddon",
      addonName: "SomeAddon",
      infoHash: undefined,
      url: "https://someaddon.example/configure",
      name: "SomeAddon",
      title: "Addon is not configured. Please configure your API key.",
      size: null,
      seeders: null,
    });
    const expiredSub = makeStream({
      addonId: "com.debrid",
      addonName: "DebridAddon",
      infoHash: undefined,
      url: undefined,
      name: "DebridAddon",
      description: "Your subscription expired. Failed to fetch streams.",
      size: null,
      seeders: null,
    });

    const result = classifyStreams([notConfigured, expiredSub]);
    expect(result.playable).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].addonName).toBe("SomeAddon");
    expect(result.errors[1].addonName).toBe("DebridAddon");
  });
});

describe("pickBestPlayable", () => {
  it("returns null and empty rest for empty list", () => {
    expect(pickBestPlayable([])).toEqual({ best: null, rest: [] });
  });

  it("picks the first stream as best and keeps the rest in order", () => {
    const a = makeStream({ score: 200, resolution: "4K" });
    const b = makeStream({ score: 150, resolution: "1080p" });
    const c = makeStream({ score: 100, resolution: "720p" });

    const picked = pickBestPlayable([a, b, c]);
    expect(picked.best).toBe(a);
    expect(picked.rest).toEqual([b, c]);
  });
});

describe("groupPlayableByQuality", () => {
  it("groups streams into 4K, 1080p, 720p, and other buckets in order and omits empty buckets", () => {
    const s4k = makeStream({ resolution: "4K", score: 300 });
    const s1080a = makeStream({ resolution: "1080p", score: 200 });
    const s1080b = makeStream({ resolution: "1080p", score: 180 });
    const s480 = makeStream({ resolution: "480p", score: 50 });
    const sSd = makeStream({ resolution: "SD", score: 40 });

    const groups = groupPlayableByQuality([s1080a, s4k, s480, s1080b, sSd]);

    expect(groups.map((g) => g.key)).toEqual(["4K", "1080p", "other"]);
    expect(groups[0].streams).toEqual([s4k]);
    expect(groups[1].streams).toEqual([s1080a, s1080b]);
    expect(groups[2].streams).toEqual([s480, sSd]);
  });

  it("includes 720p bucket when present", () => {
    const s720 = makeStream({ resolution: "720p" });
    const groups = groupPlayableByQuality([s720]);
    expect(groups).toEqual([{ key: "720p", streams: [s720] }]);
  });
});

describe("formatStreamLanguages", () => {
  it("parses a 25-flag Torrentio Nocturne stream into normalized ISO codes with zero flag emojis", () => {
    const twentyFiveFlags =
      "Nocturne.2020.2160p.AMZN.WEB-DL.DDP5.1.H.265-NTb.mkv\n" +
      "👤 81 💾 8.61 GB ⚙️ EXT\n" +
      "Multi Audio / 🇬🇧 / 🇫🇷 / 🇪🇸 / 🇩🇪 / 🇮🇹 / 🇵🇹 / 🇧🇷 / 🇷🇺 / 🇯🇵 / 🇰🇷 / 🇨🇳 / 🇮🇳 / 🇸🇦 / 🇹🇷 / 🇳🇱 / 🇵🇱 / 🇷🇴 / 🇸🇪 / 🇳🇴 / 🇩🇰 / 🇫🇮 / 🇨🇿 / 🇭🇺 / 🇬🇷 / 🇹🇭";

    const stream = makeStream({
      title: twentyFiveFlags,
      audioLanguages: [],
    });

    const formatted = formatStreamLanguages(stream, ["fr", "en"]);

    expect(formatted.primary).toEqual(["FR", "EN"]);
    expect(formatted.matchesPreferred).toBe(true);
    // 25 flags where PT + BR both normalize to PT => 24 unique ISO codes
    expect(formatted.all.length).toBe(24);
    expect(formatted.overflowCount).toBe(22);
    // Never contains any flag emoji
    for (const code of formatted.all) {
      expect(code).toMatch(/^[A-Z]{2,3}$/);
    }
  });

  it("sorts user preferredLanguages first and handles fre/fra/eng/jp aliases", () => {
    const stream = makeStream({
      audioLanguages: ["Multi", "Spanish", "English", "Japanese", "French", "Italian"],
    });

    const formatted = formatStreamLanguages(stream, ["fra", "jp", "eng"]);
    expect(formatted.primary).toEqual(["FR", "JA"]);
    expect(formatted.all).toEqual(["FR", "JA", "EN", "ES", "IT"]);
    expect(formatted.overflowCount).toBe(3);
    expect(formatted.matchesPreferred).toBe(true);

    const withThreePrimary = formatStreamLanguages(stream, ["fre", "jpn", "en"], 3);
    expect(withThreePrimary.primary).toEqual(["FR", "JA", "EN"]);
    expect(withThreePrimary.overflowCount).toBe(2);
  });

  it("sets matchesPreferred to false when preferred languages are not present", () => {
    const stream = makeStream({
      audioLanguages: ["Russian", "Italian"],
    });
    const formatted = formatStreamLanguages(stream, ["fr", "en"]);
    expect(formatted.primary).toEqual(["RU", "IT"]);
    expect(formatted.overflowCount).toBe(0);
    expect(formatted.matchesPreferred).toBe(false);
  });

  it("normalizes locale tags and ignores Multi/flag strings in normalizeLanguageToIso", () => {
    expect(normalizeLanguageToIso("fr-FR")).toBe("FR");
    expect(normalizeLanguageToIso("en_US")).toBe("EN");
    expect(normalizeLanguageToIso("fre")).toBe("FR");
    expect(normalizeLanguageToIso("Multi")).toBeNull();
    expect(normalizeLanguageToIso("🇫🇷")).toBeNull();
  });
});

describe("extractReleaseMeta", () => {
  it("extracts clean 1-line release name, addon+indexer sourceLabel, size, and good seeder health", () => {
    const stream = makeStream({
      addonName: "Torrentio",
      title:
        "Nocturne.2020.2160p.AMZN.WEB-DL.DDP5.1.H.265-NTb.mkv\n" +
        "👤 81 💾 8.61 GB ⚙️ EXT\n" +
        "🇬🇧 / 🇫🇷 / 🇪🇸",
      size: Math.round(8.61 * 1024 ** 3),
      seeders: 81,
    });

    const meta = extractReleaseMeta(stream);
    expect(meta.releaseName).toBe("Nocturne.2020.2160p.AMZN.WEB-DL.DDP5.1.H.265-NTb.mkv");
    expect(meta.sourceLabel).toBe("Torrentio · EXT");
    expect(meta.indexer).toBe("EXT");
    expect(meta.sizeLabel).toBe("8.61 GB");
    expect(meta.seeders).toBe(81);
    expect(meta.seederHealth).toBe("good");
    expect(meta.isCached).toBe(false);
  });

  it("prefers behaviorHints.filename and strips directory prefix", () => {
    const stream = makeStream({
      addonName: "Torrentio",
      behaviorHints: {
        filename: "Nocturne.2020/Nocturne.2020.1080p.WEBRip.x264.mp4",
      },
      title: "👤 22 💾 665 MB ⚙️ 1337x",
      size: 665 * 1024 ** 2,
      seeders: 22,
      cached: { rd: true },
    });

    const meta = extractReleaseMeta(stream);
    expect(meta.releaseName).toBe("Nocturne.2020.1080p.WEBRip.x264.mp4");
    expect(meta.sourceLabel).toBe("Torrentio · 1337x");
    expect(meta.sizeLabel).toBe("665 MB");
    expect(meta.seeders).toBe(22);
    expect(meta.seederHealth).toBe("ok");
    expect(meta.isCached).toBe(true);
  });

  it("computes low seeder health for <10 seeders and parses fallback size/seeders from description", () => {
    const stream = makeStream({
      addonName: "MediaFusion",
      title: undefined,
      description: "Nocturne.2020.720p.WEB-DL.mkv\n👤 4 💾 1.45 GB ⚙️ YTS",
      size: null,
      seeders: null,
    });

    const meta = extractReleaseMeta(stream);
    expect(meta.releaseName).toBe("Nocturne.2020.720p.WEB-DL.mkv");
    expect(meta.sourceLabel).toBe("MediaFusion · YTS");
    expect(meta.sizeLabel).toBe("1.45 GB");
    expect(meta.seeders).toBe(4);
    expect(meta.seederHealth).toBe("low");
  });

  it("handles missing seeders and missing indexer cleanly", () => {
    const stream = makeStream({
      addonName: "RealDebrid Direct",
      title: "Nocturne.2020.1080p.WEB-DL.mkv",
      size: Math.round(3.5 * 1024 ** 3),
      seeders: null,
    });

    const meta = extractReleaseMeta(stream);
    expect(meta.sourceLabel).toBe("RealDebrid Direct");
    expect(meta.indexer).toBeNull();
    expect(meta.sizeLabel).toBe("3.50 GB");
    expect(meta.seeders).toBeNull();
    expect(meta.seederHealth).toBeNull();
  });
});
