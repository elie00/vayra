// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { playbackForFile, savePlayback } from "@/lib/playback-history";
import {
  cachedFileForPlayback,
  expiringSoon,
  markCachedFileWarned,
  markCachedFileWatched,
  playbackStreamLabel,
  WARN_BEFORE_MS,
  type CachedEngineFile,
} from "./engine-cache";

const HASH = "9d2b067152f824489be057651edfc8e9654857cf";

function file(fileIdx: number, expiresAt: number | null = null, infoHash = HASH): CachedEngineFile {
  return { info_hash: infoHash, file_idx: fileIdx, name: `E0${fileIdx}.mkv`, size: 1, expires_at_ms: expiresAt };
}

beforeEach(() => localStorage.clear());

describe("cachedFileForPlayback", () => {
  it("finds the exact file an episode was played from, whatever the hash case", () => {
    const cached = [file(1), file(2)];
    expect(cachedFileForPlayback(cached, { infoHash: HASH.toUpperCase(), fileIdx: 2 })).toBe(cached[1]);
    expect(cachedFileForPlayback(cached, { infoHash: HASH, fileIdx: 3 })).toBeNull();
  });

  it("only guesses the file of an unknown index when the torrent left a single one", () => {
    expect(cachedFileForPlayback([file(0)], { infoHash: HASH, fileIdx: null })?.file_idx).toBe(0);
    expect(cachedFileForPlayback([file(0), file(1)], { infoHash: HASH, fileIdx: null })).toBeNull();
    expect(cachedFileForPlayback([file(0)], null)).toBeNull();
  });
});

describe("playbackStreamLabel", () => {
  it("labels a kept file the way a save from the picker would", () => {
    expect(playbackStreamLabel({ resolution: "1080p", source: "WEB-DL", savedAt: 1 })).toBe("1080p WEB-DL");
    expect(playbackStreamLabel({ parsedTitle: "Show S01E02", savedAt: 1 })).toBe("Show S01E02");
    expect(playbackStreamLabel(null)).toBeNull();
  });
});

describe("expiringSoon", () => {
  const now = 1_000_000_000;

  it("announces a file shortly before the sweep, once, and never after it is gone", () => {
    const soon = file(1, now + WARN_BEFORE_MS - 1);
    const later = file(2, now + WARN_BEFORE_MS + 60_000);
    const past = file(3, now - 1);
    const unknown = file(4, null);
    expect(expiringSoon([soon, later, past, unknown], now)).toEqual([soon]);
    markCachedFileWarned(soon);
    expect(expiringSoon([soon], now)).toEqual([]);
  });

  it("does not announce a file already watched to the end", () => {
    const soon = file(1, now + 60_000);
    markCachedFileWatched(HASH.toUpperCase(), 1);
    expect(expiringSoon([soon], now)).toEqual([]);
  });
});

describe("playbackForFile", () => {
  it("finds the episode whose last playback used a torrent file", () => {
    savePlayback("tt1", { infoHash: HASH, fileIdx: 4 }, 2, 5);
    savePlayback("tt2", { infoHash: HASH, fileIdx: 7 }, 1, 1);
    expect(playbackForFile(HASH.toUpperCase(), 4)).toMatchObject({ metaId: "tt1", season: 2, episode: 5 });
    expect(playbackForFile(HASH, 9)).toBeNull();
  });

  it("finds a movie, keyed without season or episode", () => {
    savePlayback("tt3", { infoHash: HASH, fileIdx: 0 });
    const found = playbackForFile(HASH, 0);
    expect(found?.metaId).toBe("tt3");
    expect(found?.season).toBeUndefined();
  });
});
