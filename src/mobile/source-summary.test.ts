import { expect, it } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import { sourceFacts, sourceFeatures, sourceQuality } from "./source-summary";

const t = (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);

const stream = (over: Partial<ScoredStream>): ScoredStream =>
  ({
    resolution: "1080p",
    hdrFormat: null,
    audio: { codec: "AAC", channels: 2 },
    audioLanguages: [],
    size: null,
    seeders: null,
    cached: {},
    addonName: "Torrentio",
    ...over,
  }) as ScoredStream;

it("groups a source by the quality people pick from", () => {
  expect(sourceQuality(stream({ resolution: "4K" }))).toBe("4K");
  expect(sourceQuality(stream({ resolution: "480p" }))).toBe("SD");
  expect(sourceQuality(stream({ resolution: "SD" }))).toBe("SD");
});

it("names the picture and sound that matter, not the codecs", () => {
  const dv = stream({ resolution: "4K", hdrFormat: "DV+HDR10", audio: { codec: "Atmos", channels: 8 }, audioLanguages: ["French", "English", "Spanish"] });
  expect(sourceFeatures(dv, t, "fr")).toEqual(["Dolby Vision", "Atmos", "Français, Anglais +1"]);
  expect(sourceFeatures(stream({}), t, "fr")).toEqual([]);
});

// Intl separates the unit with a narrow no-break space, as French typography wants.
it("says how big, how ready and from where", () => {
  const cached = stream({ size: 18.4 * 1024 ** 3, cached: { rd: true }, seeders: 214 });
  expect(sourceFacts(cached, t, "fr")).toEqual(["18,4\u202fGo", "Cached", "Torrentio"]);
  const p2p = stream({ size: 700 * 1024 ** 2, seeders: 33 });
  expect(sourceFacts(p2p, t, "fr")).toEqual(["700\u202fMo", "33 peers", "Torrentio"]);
});
