import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeDownloadFor: vi.fn(),
  enqueueDownload: vi.fn(),
  resolveStream: vi.fn(),
  torrentEngineAdd: vi.fn(),
  torrentEngineSelectMany: vi.fn(),
  localTorrentAllowed: vi.fn(),
}));

vi.mock("./downloads-store", () => ({
  activeDownloadFor: mocks.activeDownloadFor,
  enqueueDownload: mocks.enqueueDownload,
}));
vi.mock("@/lib/streams/resolve", () => ({ resolveStream: mocks.resolveStream }));
vi.mock("@/lib/torrent/local-engine", () => ({
  torrentEngineAdd: mocks.torrentEngineAdd,
  torrentEngineSelectMany: mocks.torrentEngineSelectMany,
}));
vi.mock("@/lib/torrent/stremio-stream", () => ({
  isVideoFile: (f: { name: string }) => /\.(mkv|mp4)$/i.test(f.name),
  localTorrentAllowed: mocks.localTorrentAllowed,
  trackersFromSources: () => [],
}));

import type { Meta } from "@/lib/cinemeta";
import type { ScoredStream } from "@/lib/streams/types";
import type { PlayEpisode } from "@/lib/view";
import { runSeasonDownload } from "./season-download";

const meta = { id: "tt1", name: "Show", type: "series" } as unknown as Meta;
const pack = { infoHash: "ABCDEF", sources: [] } as unknown as ScoredStream;

function episodes(count: number): PlayEpisode[] {
  return Array.from({ length: count }, (_, i) => ({
    season: 1,
    episode: i + 1,
  })) as PlayEpisode[];
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.activeDownloadFor.mockReturnValue(null);
  mocks.enqueueDownload.mockResolvedValue("id");
  mocks.localTorrentAllowed.mockReturnValue(true);
});

describe("runSeasonDownload over P2P", () => {
  it("counts every queued episode as done", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF",
      stream_base: "http://127.0.0.1:9000",
      files: [
        { idx: 0, name: "Show.S01E01.mkv", length: 1 },
        { idx: 1, name: "Show.S01E02.mkv", length: 1 },
        { idx: 2, name: "Show.S01E03.mkv", length: 1 },
      ],
    });
    mocks.torrentEngineSelectMany.mockResolvedValue(true);

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(3),
      debrids: [],
      signal: new AbortController().signal,
    });

    expect(p.queued).toBe(3);
    expect(p.done).toBe(3);
    expect(p.total).toBe(3);
  });

  it("does not queue an episode that is already waiting its turn", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF",
      stream_base: "http://127.0.0.1:9000",
      files: [
        { idx: 0, name: "Show.S01E01.mkv", length: 1 },
        { idx: 1, name: "Show.S01E02.mkv", length: 1 },
      ],
    });
    mocks.torrentEngineSelectMany.mockResolvedValue(true);
    mocks.activeDownloadFor.mockImplementation((_id: string, _s: number, ep: number) =>
      ep === 1 ? { status: "queued" } : null,
    );

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(2),
      debrids: [],
      signal: new AbortController().signal,
    });

    expect(p.skipped).toBe(1);
    expect(p.queued).toBe(1);
    expect(p.done).toBe(2);
  });

  it("counts episodes missing from the pack as done too", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF",
      stream_base: "http://127.0.0.1:9000",
      files: [{ idx: 0, name: "Show.S01E01.mkv", length: 1 }],
    });
    mocks.torrentEngineSelectMany.mockResolvedValue(true);

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(3),
      debrids: [],
      signal: new AbortController().signal,
    });

    expect(p.queued).toBe(1);
    expect(p.failed).toBe(2);
    expect(p.done).toBe(3);
  });

  it("reports a refused engine selection as a finished run", async () => {
    mocks.torrentEngineAdd.mockResolvedValue({
      info_hash: "ABCDEF",
      stream_base: "http://127.0.0.1:9000",
      files: [
        { idx: 0, name: "Show.S01E01.mkv", length: 1 },
        { idx: 1, name: "Show.S01E02.mkv", length: 1 },
      ],
    });
    mocks.torrentEngineSelectMany.mockResolvedValue(false);

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(2),
      debrids: [],
      signal: new AbortController().signal,
    });

    expect(p.queued).toBe(0);
    expect(p.failed).toBe(2);
    expect(p.done).toBe(2);
  });
});

describe("runSeasonDownload through a debrid", () => {
  const debrids = [{ kind: "rd" }] as never[];

  it("counts each episode once", async () => {
    mocks.resolveStream.mockResolvedValue({ ok: true, data: { url: "https://cdn/f.mkv" } });

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(3),
      debrids,
      signal: new AbortController().signal,
    });

    expect(p.queued).toBe(3);
    expect(p.done).toBe(3);
    expect(p.failed).toBe(0);
  });

  it("counts an unresolved episode as failed without queueing it", async () => {
    mocks.resolveStream
      .mockResolvedValueOnce({ ok: true, data: { url: "https://cdn/1.mkv" } })
      .mockResolvedValueOnce({ ok: false, error: "no file" });

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: episodes(2),
      debrids,
      signal: new AbortController().signal,
    });

    expect(p.queued).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.done).toBe(2);
    expect(mocks.enqueueDownload).toHaveBeenCalledTimes(1);
  });
});

describe("runSeasonDownload episode selection", () => {
  const debrids = [{ kind: "rd" }] as never[];

  function dated(airDate: string | undefined, episode: number): PlayEpisode {
    return { season: 1, episode, airDate } as PlayEpisode;
  }

  it("leaves out episodes that have not aired yet", async () => {
    mocks.resolveStream.mockResolvedValue({ ok: true, data: { url: "https://cdn/f.mkv" } });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: [dated("2020-01-01", 1), dated("2020-01-08", 2), dated(future, 3)],
      debrids,
      signal: new AbortController().signal,
    });

    expect(p.total).toBe(2);
    expect(p.queued).toBe(2);
    expect(p.failed).toBe(0);
  });

  it("still tries an episode with no known air date", async () => {
    mocks.resolveStream.mockResolvedValue({ ok: true, data: { url: "https://cdn/f.mkv" } });

    const p = await runSeasonDownload({
      meta,
      stream: pack,
      episodes: [dated(undefined, 1), dated("not-a-date", 2)],
      debrids,
      signal: new AbortController().signal,
    });

    expect(p.total).toBe(2);
    expect(p.queued).toBe(2);
  });
});
