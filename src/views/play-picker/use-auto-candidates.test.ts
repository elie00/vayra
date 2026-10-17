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

describe("the next episode keeps its source", () => {
  // Episode 3 played from this torrent source; episode 4 offers it again, after a
  // debrid-cached link that would otherwise come first.
  const entry = { addonId: "torrentio", resolution: "1080p", source: "WEB-DL", savedAt: 0 };
  const cached = stream("Show S01E04 720p RD+", [], { url: "https://debrid.invalid/e04-720", resolution: "720p", addonId: "comet" });
  cachedUrls.add(cached.url!);
  const sameTorrent = stream("Show S01E04 1080p WEB-DL", [], { infoHash: "d".repeat(40), addonId: "torrentio", source: "WEB-DL", seeders: 80 });
  const run = (p2pAutoConsent: boolean) =>
    buildAutoCandidates({
      filteredPicker: { all: [cached, sameTorrent], primary: cached },
      previousPlayback: null,
      sourceEntry: entry,
      isCached,
      addons: null,
      hasStrongAddon: false,
      isTorrentioStream: () => false,
      preferredLangs: [],
      p2pAutoConsent,
    }).map((s) => s.title);

  it("plays the same torrent source first when P2P may start on its own", () => {
    expect(run(true)).toEqual(["Show S01E04 1080p WEB-DL", "Show S01E04 720p RD+"]);
  });

  it("keeps the cached link first when P2P needs the user's consent", () => {
    expect(run(false)[0]).toBe("Show S01E04 720p RD+");
  });
});

describe("one candidate per torrent", () => {
  // 17 October: a torrent judged too slow came back as the next candidate, offered
  // again by another add-on, and the retry played the same swarm.
  const hash = "b4baca3dc193d2317eaed8fc3efb872f1fd6de1c";
  const fromTorrentio = stream("Show S01E01 1080p", [], { infoHash: hash, addonId: "torrentio" });
  const fromOther = stream("Show.S01E01.1080p.WEB", [], { infoHash: hash.toUpperCase(), addonId: "other", url: "http://127.0.0.1:11470/" + hash + "/0" });
  const other = stream("Show S01E01 720p", [], { infoHash: "c".repeat(40), addonId: "torrentio" });

  it("offers a torrent the engine would download once, so a retry moves to another", () => {
    expect(candidates([fromTorrentio, fromOther, other], [])).toEqual(["Show S01E01 1080p", "Show S01E01 720p"]);
  });

  it("keeps a debrid-cached link to the same torrent apart", () => {
    const cached = stream("Show S01E01 1080p RD+", [], { infoHash: hash, url: "https://debrid.invalid/show-e01" });
    cachedUrls.add(cached.url!);
    expect(candidates([cached, fromTorrentio], [])).toEqual(["Show S01E01 1080p RD+", "Show S01E01 1080p"]);
  });
});
