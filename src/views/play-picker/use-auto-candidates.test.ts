import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScoredStream } from "@/lib/streams/types";
import { buildAutoCandidates } from "./use-auto-candidates";

function stream(title: string, audioLanguages: string[], extra: Partial<ScoredStream> = {}): ScoredStream {
  return { addonId: "addon", title, audioLanguages, resolution: "1080p", ...extra } as ScoredStream;
}

const cachedUrls = new Set<string>();
const isCached = (s: ScoredStream) => !!s.url && cachedUrls.has(s.url);

function candidates(all: ScoredStream[], preferredLangs: string[]) {
  return buildAutoCandidates({
    filteredPicker: { all, primary: all[0] ?? null },
    previousPlayback: null,
    sourceEntry: null,
    isCached,
    addons: null,
    hasStrongAddon: false,
    isTorrentioStream: () => false,
    preferredLangs,
  }).map((s) => s.title);
}

// The 12 September case: the French source stalls, and a retry must not start a
// cached release that declares another audio language.
const latino = stream("NoTorrent Audio Latino", ["Latino"], { url: "https://debrid.invalid/latino" });
const french = stream("HiggsBoson MULTI", ["French", "English"], { infoHash: "a".repeat(40) });
const untagged = stream("Untagged release", [], { url: "https://debrid.invalid/untagged" });
cachedUrls.add(latino.url!);
cachedUrls.add(untagged.url!);

beforeAll(() => {
  // The desktop app, where P2P sources can be started from the bundled engine.
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
});
afterAll(() => vi.unstubAllGlobals());

describe("automatic source candidates", () => {
  it("never auto-plays a source that declares another audio language", () => {
    expect(candidates([latino, french, untagged], ["French"])).toEqual(["Untagged release", "HiggsBoson MULTI"]);
  });

  it("keeps sources that declare no language or Multi", () => {
    const multi = stream("Pack MULTi", ["Multi"], { infoHash: "b".repeat(40) });
    expect(candidates([untagged, multi], ["French"])).toEqual(["Untagged release", "Pack MULTi"]);
  });

  it("does not filter when no audio language is preferred", () => {
    expect(candidates([latino, french], [])).toContain("NoTorrent Audio Latino");
  });
});
