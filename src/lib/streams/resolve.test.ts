import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  torrentEngineAdd: vi.fn(),
  torrentEngineSelect: vi.fn(),
  localTorrentAllowed: vi.fn(),
  fullDownloadEnabled: vi.fn(),
}));

vi.mock("@/lib/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/debug", () => ({ dwarn: vi.fn() }));
vi.mock("@/lib/torrent/local-engine", () => ({
  lastEngineAddError: () => null,
  torrentEngineAdd: mocks.torrentEngineAdd,
  torrentEngineSelect: mocks.torrentEngineSelect,
}));
vi.mock("@/lib/torrent/full-download", () => ({
  fullDownloadEnabled: mocks.fullDownloadEnabled,
  startFullDownload: vi.fn(),
}));
vi.mock("@/lib/torrent/stremio-stream", () => ({
  directTorrentEnabled: () => true,
  engineP2pEligible: () => true,
  isVideoFile: (f: { name: string }) => /\.(mkv|mp4)$/i.test(f.name),
  localTorrentAllowed: mocks.localTorrentAllowed,
  trackersFromSources: () => [],
}));

import type { ParsedStream } from "./types";
import { resolveStream } from "./resolve";

const batch = {
  infoHash: "abcdef0123456789abcdef0123456789abcdef01",
  sources: [],
} as unknown as ParsedStream;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.localTorrentAllowed.mockReturnValue(true);
  mocks.fullDownloadEnabled.mockReturnValue(false);
  mocks.torrentEngineSelect.mockResolvedValue(undefined);
});

describe("resolveStream over the local engine", () => {
  it("picks the file the absolute episode number names", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      stream_base: "http://127.0.0.1:11470/stream",
      files: [
        { idx: 0, name: "[Grp] Show - 1042 [1080p].mkv", length: 700 },
        { idx: 1, name: "[Grp] Show - 1043 [1080p].mkv", length: 500 },
      ],
    });

    const r = await resolveStream(batch, [], new AbortController().signal, true, true, {
      season: 22,
      episode: 3,
      absolute: 1043,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.fileIdx).toBe(1);
    expect(r.data.url).toBe(
      "http://127.0.0.1:11470/stream/abcdef0123456789abcdef0123456789abcdef01/1",
    );
  });

  it("still matches SxxExx when there is no absolute number", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      stream_base: "http://127.0.0.1:11470/stream",
      files: [
        { idx: 0, name: "Show.S02E01.mkv", length: 900 },
        { idx: 1, name: "Show.S02E02.mkv", length: 100 },
      ],
    });

    const r = await resolveStream(batch, [], new AbortController().signal, true, true, {
      season: 2,
      episode: 2,
      absolute: null,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.fileIdx).toBe(1);
  });

  it("falls back to the largest file when nothing matches", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      stream_base: "http://127.0.0.1:11470/stream",
      files: [
        { idx: 0, name: "sample.mkv", length: 10 },
        { idx: 1, name: "feature.mkv", length: 9000 },
      ],
    });

    const r = await resolveStream(batch, [], new AbortController().signal, true, true, {
      season: 9,
      episode: 9,
      absolute: 999,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.fileIdx).toBe(1);
  });
});
