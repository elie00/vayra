import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startDownload: vi.fn(),
  downloadDir: vi.fn(),
  retainTorrentForDownload: vi.fn(),
  releaseTorrentForDownload: vi.fn(),
  removeDownloadFile: vi.fn(),
  downloadFileExists: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ downloadDir: mocks.downloadDir }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("./video-download", () => ({
  startDownload: mocks.startDownload,
  removeDownloadFile: mocks.removeDownloadFile,
  downloadFileExists: mocks.downloadFileExists,
}));
vi.mock("@/lib/torrent/local-engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/torrent/local-engine")>()),
  retainTorrentForDownload: mocks.retainTorrentForDownload,
  releaseTorrentForDownload: mocks.releaseTorrentForDownload,
}));

import type { Meta } from "@/lib/cinemeta";
import {
  cancelDownload,
  configureDownloads,
  prioritizeDownload,
  downloadSnapshot,
  enqueueDownload,
  MAX_ACTIVE_DOWNLOADS,
  pauseDownload,
  removeDownload,
  resumeDownload,
} from "./downloads-store";

const meta = { id: "tt1", name: "Show" } as unknown as Meta;

const store = new Map<string, string>();
let writes = 0;

function startable() {
  let finish = () => {};
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolve, fail) => {
    finish = resolve;
    reject = fail;
  });
  const abort = vi.fn(() => {
    const error = new Error("canceled");
    error.name = "AbortError";
    reject(error);
  });
  return { handle: { promise, abort }, finish };
}

// Hand the store back the progress callback the download was started with.
function lastProgressCallback(): (p: {
  receivedBytes: number;
  totalBytes: number | null;
  ratio: number;
}) => void {
  const call = mocks.startDownload.mock.calls.at(-1);
  if (!call) throw new Error("no download was started");
  return call[3];
}

beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  writes = 0;
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.downloadDir.mockResolvedValue("/dl");
  mocks.downloadFileExists.mockResolvedValue(false);
  mocks.removeDownloadFile.mockResolvedValue(undefined);
  mocks.startDownload.mockImplementation(() => startable().handle);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes += 1;
      store.set(k, v);
    },
  });
  vi.stubGlobal("navigator", { platform: "MacIntel" });
  configureDownloads({ concurrent: 3, quotaGiB: 0 });
});

afterEach(async () => {
  for (const d of JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{ id: string }>) {
    removeDownload(d.id);
  }
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("download destination ownership", () => {
  it("reserves names before delayed filesystem checks for concurrent enqueues", async () => {
    const checks: Array<{ path: string; finish: (exists: boolean) => void }> = [];
    mocks.downloadFileExists.mockImplementation((path: string) => new Promise<boolean>((finish) => {
      checks.push({ path, finish });
    }));

    const first = enqueueDownload({ meta, url: "https://cdn/first.mkv", destinationPath: "/chosen/video.mkv" });
    const second = enqueueDownload({ meta, url: "https://cdn/second.mkv", destinationPath: "/chosen/video.mkv" });
    await vi.advanceTimersByTimeAsync(0);

    expect(checks.map((check) => check.path)).toEqual([
      "/chosen/video.mkv", "/chosen/video.mkv.part", "/chosen/video.mkv.part.vayra-resume.json",
      "/chosen/video (2).mkv", "/chosen/video (2).mkv.part", "/chosen/video (2).mkv.part.vayra-resume.json",
    ]);
    for (const check of checks) check.finish(false);
    const ids = await Promise.all([first, second]);

    expect(ids[0]).not.toBe(ids[1]);
    expect(mocks.startDownload.mock.calls.map((call) => call[2])).toEqual([
      "/chosen/video.mkv", "/chosen/video (2).mkv",
    ]);
  });

  it("does not resolve a default folder for an explicitly chosen destination", async () => {
    store.set("harbor.settings", JSON.stringify({ downloadDir: "/default", downloadCreateFolders: true }));
    const id = await enqueueDownload({ meta, url: "https://cdn/video.mkv", destinationPath: "/chosen/My video.mp4" });

    expect(mocks.downloadDir).not.toHaveBeenCalled();
    expect(downloadSnapshot().find((item) => item.id === id)?.path).toBe("/chosen/My video.mp4");
  });

  it.each(["", ".part", ".part.vayra-resume.json"])("preserves an existing destination%s", async (suffix) => {
    mocks.downloadFileExists.mockImplementation(async (path: string) => path === `/dl/Show.mkv${suffix}`);
    const id = await enqueueDownload({ meta, url: "https://cdn/video.mkv" });

    expect(downloadSnapshot().find((item) => item.id === id)?.path).toBe("/dl/Show (2).mkv");
    expect(mocks.removeDownloadFile).not.toHaveBeenCalled();
  });

  it("does not let an explicit filename overlap another download's partial file", async () => {
    await enqueueDownload({ meta, url: "https://cdn/first.mkv", destinationPath: "/dl/video.mkv" });
    const second = await enqueueDownload({ meta, url: "https://cdn/second.mkv", destinationPath: "/dl/video.mkv.part" });

    expect(downloadSnapshot().find((item) => item.id === second)?.path).toBe("/dl/video.mkv (2).part");
  });

  it("fails rather than reusing the original name after exhausting available suffixes", async () => {
    mocks.downloadFileExists.mockResolvedValue(true);
    await expect(enqueueDownload({ meta, url: "https://cdn/video.mkv" })).rejects.toThrow("Aucun nom de fichier disponible");
    expect(mocks.startDownload).not.toHaveBeenCalled();
    expect(downloadSnapshot()).toHaveLength(0);

    mocks.downloadFileExists.mockResolvedValue(false);
    const id = await enqueueDownload({ meta, url: "https://cdn/video.mkv" });
    expect(downloadSnapshot().find((item) => item.id === id)?.path).toBe("/dl/Show.mkv");
  });

  it("releases the name and fails closed when a filesystem check fails", async () => {
    mocks.downloadFileExists.mockRejectedValueOnce(new Error("permission denied"));
    await expect(enqueueDownload({ meta, url: "https://cdn/video.mkv" })).rejects.toThrow("Impossible de vérifier la destination");
    expect(mocks.startDownload).not.toHaveBeenCalled();

    const id = await enqueueDownload({ meta, url: "https://cdn/video.mkv" });
    expect(downloadSnapshot().find((item) => item.id === id)?.path).toBe("/dl/Show.mkv");
  });

  it("releases a reservation if creating its item throws before registration", async () => {
    const brokenMeta = { id: "broken", get name(): string { throw new Error("invalid metadata"); } } as Meta;
    await expect(enqueueDownload({ meta: brokenMeta, url: "https://cdn/video.mkv", destinationPath: "/chosen/video.mkv" })).rejects.toThrow("invalid metadata");

    const id = await enqueueDownload({ meta, url: "https://cdn/video.mkv", destinationPath: "/chosen/video.mkv" });
    expect(downloadSnapshot().find((item) => item.id === id)?.path).toBe("/chosen/video.mkv");
  });

  it("copies headers before asynchronous work without persisting credentials", async () => {
    let resolveDirectory!: (directory: string) => void;
    mocks.downloadDir.mockReturnValue(new Promise<string>((resolve) => { resolveDirectory = resolve; }));
    const headers = { Authorization: "Bearer original", Referer: "https://original.example" };
    const pending = enqueueDownload({ meta, url: "https://cdn/video.mkv", headers });
    headers.Authorization = "Bearer changed";
    headers.Referer = "https://changed.example";
    resolveDirectory("/dl");
    await pending;

    expect(mocks.startDownload.mock.calls[0][4]).toEqual({
      Authorization: "Bearer original", Referer: "https://original.example",
    });
    expect(mocks.startDownload.mock.calls[0][4]).not.toBe(headers);
    expect(store.get("harbor.downloads.v1")).not.toMatch(/Bearer|Authorization|Referer/);
  });

  it("rejects an empty explicit name instead of silently saving elsewhere", async () => {
    await expect(enqueueDownload({ meta, url: "https://cdn/video.mkv", destinationPath: " " })).rejects.toThrow("Choisissez un nom de fichier");
    expect(mocks.downloadFileExists).not.toHaveBeenCalled();
    expect(mocks.startDownload).not.toHaveBeenCalled();
  });
});

describe("enqueueDownload persistence", () => {
  it("does not write to storage on every progress tick", async () => {
    await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    const onProgress = lastProgressCallback();
    writes = 0;

    for (let i = 1; i <= 40; i++) {
      onProgress({ receivedBytes: i * 1_000_000, totalBytes: 40_000_000, ratio: i / 40 });
    }

    expect(writes).toBeLessThanOrEqual(1);
  });

  it("still persists the received bytes once the ticks settle", async () => {
    const id = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    const onProgress = lastProgressCallback();

    onProgress({ receivedBytes: 7_000_000, totalBytes: 40_000_000, ratio: 0.175 });
    await vi.advanceTimersByTimeAsync(2000);

    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      receivedBytes: number;
    }>;
    expect(saved.find((d) => d.id === id)?.receivedBytes).toBe(7_000_000);
  });
});

describe("engine file release", () => {
  const engineUrl = "http://127.0.0.1:11470/stream/0123456789abcdef0123456789abcdef01234567/4";

  it("hands the file back once the download settles", async () => {
    let finish = () => {};
    mocks.startDownload.mockReturnValue({
      promise: new Promise<void>((res) => (finish = res)),
      abort: vi.fn(),
    });

    const id = await enqueueDownload({ meta, url: engineUrl });
    expect(mocks.releaseTorrentForDownload).not.toHaveBeenCalled();

    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.retainTorrentForDownload).toHaveBeenCalledWith(id, engineUrl);
    expect(mocks.releaseTorrentForDownload).toHaveBeenCalledWith(id);
  });

  it("hands the file back when the entry is removed mid-download", async () => {
    const id = await enqueueDownload({ meta, url: engineUrl });
    removeDownload(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.releaseTorrentForDownload).toHaveBeenCalledWith(id);
  });

  it("leaves a plain HTTP download alone", async () => {
    const id = await enqueueDownload({ meta, url: "https://cdn.example/video.mkv" });
    removeDownload(id);

    expect(mocks.retainTorrentForDownload).not.toHaveBeenCalled();
  });
});

describe("download concurrency", () => {
  it("applies the chosen limit and promotes the selected queued download", async () => {
    configureDownloads({ concurrent: 1 });
    const first = startable(); mocks.startDownload.mockReturnValue(first.handle);
    await enqueueDownload({ meta, url: "https://cdn/first.mkv" });
    await enqueueDownload({ meta, url: "https://cdn/second.mkv" });
    const third = await enqueueDownload({ meta, url: "https://cdn/third.mkv" });
    prioritizeDownload(third); expect(mocks.startDownload).toHaveBeenCalledTimes(1);
    first.finish(); mocks.startDownload.mockReturnValue(startable().handle);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.startDownload.mock.calls[1][0]).toBe(third);
  });

  it("reserves unknown-sized transfers and shares only the confirmed spare budget", async () => {
    configureDownloads({ quotaGiB: 1 });
    await enqueueDownload({ meta, url: "https://cdn/first.mkv" });
    const second = await enqueueDownload({ meta, url: "https://cdn/second.mkv" });
    expect(mocks.startDownload).toHaveBeenCalledTimes(1);
    expect(downloadSnapshot().find((d) => d.id === second)?.status).toBe("queued");
    lastProgressCallback()({ receivedBytes: 0, totalBytes: 256 * 1024 ** 2, ratio: 0 });
    expect(mocks.startDownload).toHaveBeenCalledTimes(2);
    expect(mocks.startDownload.mock.calls[1][5]).toBe(768 * 1024 ** 2);
  });

  it("runs no more than the concurrency limit at once", async () => {
    const finishers: Array<() => void> = [];
    mocks.startDownload.mockImplementation(() => {
      const s = startable();
      finishers.push(s.finish);
      return s.handle;
    });

    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DOWNLOADS + 3; i++) {
      ids.push(await enqueueDownload({ meta, url: `https://cdn/${i}.mkv` }));
    }

    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS);
  });

  it("starts a waiting download when a running one finishes", async () => {
    const finishers: Array<() => void> = [];
    mocks.startDownload.mockImplementation(() => {
      const s = startable();
      finishers.push(s.finish);
      return s.handle;
    });

    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DOWNLOADS + 1; i++) {
      ids.push(await enqueueDownload({ meta, url: `https://cdn/${i}.mkv` }));
    }
    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS);

    finishers[0]();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS + 1);
  });

  it("cancels a download that never started", async () => {
    mocks.startDownload.mockImplementation(() => startable().handle);

    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DOWNLOADS + 2; i++) {
      ids.push(await enqueueDownload({ meta, url: `https://cdn/${i}.mkv` }));
    }
    const waiting = ids[ids.length - 1];
    cancelDownload(waiting);

    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      status: string;
    }>;
    expect(saved.find((d) => d.id === waiting)?.status).toBe("canceled");
    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS);
  });

  it("does not let a removed waiting download take a slot later", async () => {
    const finishers: Array<() => void> = [];
    mocks.startDownload.mockImplementation(() => {
      const s = startable();
      finishers.push(s.finish);
      return s.handle;
    });

    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DOWNLOADS + 2; i++) {
      ids.push(await enqueueDownload({ meta, url: `https://cdn/${i}.mkv` }));
    }
    removeDownload(ids[MAX_ACTIVE_DOWNLOADS]);

    finishers[0]();
    await vi.advanceTimersByTimeAsync(0);

    // The slot goes to the one still waiting, not to the removed entry.
    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS + 1);
    const lastUrl = mocks.startDownload.mock.calls.at(-1)?.[1];
    expect(lastUrl).toBe(`https://cdn/${MAX_ACTIVE_DOWNLOADS + 1}.mkv`);
  });
});

describe("pause and resume", () => {
  it("keeps partial progress and request headers when a running download resumes", async () => {
    const aborts: Array<ReturnType<typeof vi.fn>> = [];
    mocks.startDownload.mockImplementation(() => {
      let reject!: (reason: Error) => void;
      const promise = new Promise<void>((_resolve, rej) => {
        reject = rej;
      });
      const abort = vi.fn(() => {
        const error = new Error("paused");
        error.name = "AbortError";
        reject(error);
      });
      aborts.push(abort);
      return { promise, abort };
    });

    const id = await enqueueDownload({
      meta,
      url: "https://cdn/protected.mkv",
      headers: { Authorization: "Bearer test" },
    });
    lastProgressCallback()({ receivedBytes: 8_000_000, totalBytes: 40_000_000, ratio: 0.2 });

    pauseDownload(id);
    resumeDownload(id); // A fast click must work even while abort is still settling.
    await vi.advanceTimersByTimeAsync(0);

    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      receivedBytes: number;
      status: string;
    }>;
    expect(aborts[0]).toHaveBeenCalledOnce();
    expect(saved.find((d) => d.id === id)).toMatchObject({
      receivedBytes: 8_000_000,
      status: "downloading",
    });
    expect(mocks.startDownload).toHaveBeenCalledTimes(2);
    expect(mocks.startDownload.mock.calls.at(-1)?.[4]).toEqual({ Authorization: "Bearer test" });
  });

  it("can pause and requeue a download before it starts", async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_DOWNLOADS + 1; i++) {
      ids.push(await enqueueDownload({ meta, url: `https://cdn/${i}.mkv` }));
    }
    const waiting = ids.at(-1)!;

    pauseDownload(waiting);
    let saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      status: string;
    }>;
    expect(saved.find((d) => d.id === waiting)?.status).toBe("paused");

    resumeDownload(waiting);
    saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      status: string;
    }>;
    expect(saved.find((d) => d.id === waiting)?.status).toBe("queued");
    expect(mocks.startDownload).toHaveBeenCalledTimes(MAX_ACTIVE_DOWNLOADS);
  });
});

describe("removing a download", () => {
  it("deletes the file from disk, not just the entry", async () => {
    const id = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      path: string;
    }>;
    const path = saved.find((d) => d.id === id)?.path;

    removeDownload(id);
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.removeDownloadFile).toHaveBeenCalledWith(path);
  });

  it("reserves the name until the old writer stops and deferred deletion finishes", async () => {
    let settleWriter!: (error: Error) => void;
    const abort = vi.fn();
    mocks.startDownload.mockReturnValueOnce({
      promise: new Promise<void>((_resolve, reject) => { settleWriter = reject; }), abort,
    });
    let finishRemoval!: () => void;
    mocks.removeDownloadFile.mockReturnValueOnce(new Promise<void>((resolve) => { finishRemoval = resolve; }));
    const args = { meta, url: "https://cdn/a.mkv", destinationPath: "/dl/video.mkv" };

    const first = await enqueueDownload(args);
    removeDownload(first);
    expect(abort).toHaveBeenCalledOnce();
    expect(mocks.removeDownloadFile).not.toHaveBeenCalled();

    const duringAbort = await enqueueDownload(args);
    expect(downloadSnapshot().find((item) => item.id === duringAbort)?.path).toBe("/dl/video (2).mkv");
    const canceled = new Error("canceled");
    canceled.name = "AbortError";
    settleWriter(canceled);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.removeDownloadFile).toHaveBeenCalledWith("/dl/video.mkv");

    const duringRemoval = await enqueueDownload(args);
    expect(downloadSnapshot().find((item) => item.id === duringRemoval)?.path).toBe("/dl/video (3).mkv");
    finishRemoval();
    await vi.advanceTimersByTimeAsync(0);

    const afterRemoval = await enqueueDownload(args);
    expect(downloadSnapshot().find((item) => item.id === afterRemoval)?.path).toBe("/dl/video.mkv");
  });

  it("keeps a refused deletion visible, reserved and recoverable until retry succeeds", async () => {
    mocks.removeDownloadFile.mockRejectedValue(new Error("permission denied"));

    const id = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    lastProgressCallback()({ receivedBytes: 1024, totalBytes: 2048, ratio: 0.5 });
    const removal = removeDownload(id);
    expect(removeDownload(id)).toBe(removal);
    expect(downloadSnapshot().find((d) => d.id === id)?.status).toBe("removing");
    expect(await removal).toBe(false);

    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]");
    expect(saved.find((d: { id: string }) => d.id === id)).toMatchObject({ status: "removal-error", receivedBytes: 1024, error: "permission denied" });
    await vi.advanceTimersByTimeAsync(0);
    resumeDownload(id);
    cancelDownload(id);
    expect(downloadSnapshot().find((d) => d.id === id)?.status).toBe("removal-error");
    const other = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    expect(downloadSnapshot().find((item) => item.id === other)?.path).toBe("/dl/Show (2).mkv");
    mocks.removeDownloadFile.mockResolvedValue(undefined);
    expect(await removeDownload(id)).toBe(true);
    expect(downloadSnapshot().some((d) => d.id === id)).toBe(false);
    const afterRemoval = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    expect(downloadSnapshot().find((item) => item.id === afterRemoval)?.path).toBe("/dl/Show.mkv");
  });

  it("does not free storage budget for a file that could not be removed", async () => {
    configureDownloads({ quotaGiB: 1 });
    const id = await enqueueDownload({ meta, url: "https://cdn/full.mkv" });
    lastProgressCallback()({ receivedBytes: 1024 ** 3, totalBytes: 1024 ** 3, ratio: 1 });
    mocks.removeDownloadFile.mockRejectedValueOnce(new Error("permission denied"));
    expect(await removeDownload(id)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    const waitingId = await enqueueDownload({ meta, url: "https://cdn/next.mkv" });
    expect(mocks.startDownload).toHaveBeenCalledTimes(1);
    expect(downloadSnapshot().find((d) => d.id === waitingId)?.status).toBe("error");
    expect(await removeDownload(id)).toBe(true);
    resumeDownload(waitingId);
    expect(mocks.startDownload).toHaveBeenCalledTimes(2);
  });
});
