// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), stopFullDownload: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("./full-download", () => ({ stopFullDownload: mocks.stopFullDownload }));

const hash = "0123456789abcdef0123456789abcdef01234567";
const otherHash = "fedcba9876543210fedcba9876543210fedcba98";
const url = (index = 12, infoHash = hash) => `http://127.0.0.1:11470/stream/${infoHash}/${index}`;
let engine: typeof import("./local-engine");
const calls = (command: string) => mocks.invoke.mock.calls.filter(([name]) => name === command);

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  mocks.stopFullDownload.mockReset();
  engine = await import("./local-engine");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("download ownership of the local torrent", () => {
  it("holds synchronously before selection resolves and delays a source-switch removal", async () => {
    let selected!: () => void;
    mocks.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { selected = resolve; }));
    const retaining = engine.retainTorrentForDownload("download-a", url());
    await engine.torrentEngineRemove(hash, true);
    expect(calls("torrent_engine_remove")).toHaveLength(0);
    expect(mocks.stopFullDownload).not.toHaveBeenCalled();
    await Promise.resolve();
    selected();
    await retaining;
    await engine.releaseTorrentForDownload("download-a");
    expect(calls("torrent_engine_release")[0][1]).toEqual({ infoHash: hash, fileIdxs: [12] });
    expect(calls("torrent_engine_remove")[0][1]).toEqual({ infoHash: hash, deleteFiles: true });
  });

  it("keeps a download alive after the player exit grace period", async () => {
    await engine.retainTorrentForDownload("download-a", url());
    engine.scheduleTorrentRemoval(hash, false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(calls("torrent_engine_remove")).toHaveLength(0);
    await engine.releaseTorrentForDownload("download-a");
    expect(calls("torrent_engine_remove")[0][1]).toEqual({ infoHash: hash, deleteFiles: false });
  });

  it("does not tear down reopened playback when the final download completes", async () => {
    await engine.retainTorrentForDownload("download-a", url());
    engine.scheduleTorrentRemoval(hash, true);
    await vi.advanceTimersByTimeAsync(1200);
    engine.cancelTorrentRemoval(hash.toUpperCase());
    await engine.releaseTorrentForDownload("download-a");
    expect(calls("torrent_engine_remove")).toHaveLength(0);
  });

  it("retains every episode and removes the torrent only after its last owner", async () => {
    await Promise.all([
      engine.retainTorrentForDownload("episode-a", url(1)),
      engine.retainTorrentForDownload("episode-b", url(2)),
    ]);
    expect(calls("torrent_engine_select_many").at(-1)?.[1]).toEqual({ infoHash: hash, fileIdxs: [1, 2] });
    await engine.torrentEngineRemove(hash, false);
    await engine.releaseTorrentForDownload("episode-a");
    expect(calls("torrent_engine_remove")).toHaveLength(0);
    await engine.releaseTorrentForDownload("episode-b");
    expect(calls("torrent_engine_remove")).toHaveLength(1);
  });

  it("does not release a file while another download still owns the same file", async () => {
    await engine.retainTorrentForDownload("copy-a", url());
    await engine.retainTorrentForDownload("copy-b", url());
    await engine.releaseTorrentForDownload("copy-a");
    expect(calls("torrent_engine_release")).toHaveLength(0);
    await engine.releaseTorrentForDownload("copy-b");
    expect(calls("torrent_engine_release")).toHaveLength(1);
  });

  it("reselects safely on resume without counting the same download twice", async () => {
    await engine.retainTorrentForDownload("download-a", url());
    await engine.retainTorrentForDownload("download-a", url());
    expect(calls("torrent_engine_select_many")).toHaveLength(2);
    await engine.torrentEngineRemove(hash, false);
    await engine.releaseTorrentForDownload("download-a");
    await engine.releaseTorrentForDownload("download-a");
    expect(calls("torrent_engine_remove")).toHaveLength(1);
    expect(calls("torrent_engine_release")).toHaveLength(1);
  });

  it("keeps the hold after a selection error so retry can reuse the source", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("engine unavailable"));
    await expect(engine.retainTorrentForDownload("download-a", url())).rejects.toThrow("engine unavailable");
    await engine.torrentEngineRemove(hash, false);
    expect(calls("torrent_engine_remove")).toHaveLength(0);
    await engine.retainTorrentForDownload("download-a", url());
    await engine.releaseTorrentForDownload("download-a");
    expect(calls("torrent_engine_remove")).toHaveLength(1);
  });

  it("never redirects an existing partial download's torrent ownership", async () => {
    await engine.retainTorrentForDownload("download-a", url());
    await expect(engine.retainTorrentForDownload("download-a", url(2, otherHash)))
      .rejects.toThrow("cannot change its torrent source");
    await engine.torrentEngineRemove(hash, false);
    await engine.torrentEngineRemove(otherHash, false);
    expect(calls("torrent_engine_remove")).toEqual([["torrent_engine_remove", { infoHash: otherHash, deleteFiles: false }]]);
  });

  it("does not pin the local engine for public URLs or a remote Stremio server", async () => {
    await engine.retainTorrentForDownload("public", "https://cdn.example/film.mkv");
    await engine.retainTorrentForDownload("remote", `https://remote.example/stream/${hash}/12`);
    await engine.torrentEngineRemove(hash, false);
    expect(calls("torrent_engine_select_many")).toHaveLength(0);
    expect(calls("torrent_engine_remove")).toHaveLength(1);
  });

  it("withdraws removal if playback returns while a final release is pending", async () => {
    await engine.retainTorrentForDownload("download-a", url());
    let released!: () => void;
    mocks.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { released = resolve; }));
    const releasing = engine.releaseTorrentForDownload("download-a");
    const removing = engine.torrentEngineRemove(hash, true);
    engine.cancelTorrentRemoval(hash);
    await Promise.resolve();
    await Promise.resolve();
    released();
    await Promise.all([releasing, removing]);
    expect(calls("torrent_engine_remove")).toHaveLength(0);
  });
});
