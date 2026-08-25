import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startDownload: vi.fn(),
  downloadDir: vi.fn(),
  torrentEngineRelease: vi.fn(),
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
  torrentEngineRelease: mocks.torrentEngineRelease,
}));

import type { Meta } from "@/lib/cinemeta";
import {
  cancelDownload,
  enqueueDownload,
  MAX_ACTIVE_DOWNLOADS,
  removeDownload,
} from "./downloads-store";

const meta = { id: "tt1", name: "Show" } as unknown as Meta;

const store = new Map<string, string>();
let writes = 0;

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
  mocks.startDownload.mockReturnValue({ promise: new Promise(() => {}), abort: vi.fn() });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes += 1;
      store.set(k, v);
    },
  });
  vi.stubGlobal("navigator", { platform: "MacIntel" });
});

afterEach(() => {
  for (const d of JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{ id: string }>) {
    removeDownload(d.id);
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

    await enqueueDownload({ meta, url: engineUrl });
    expect(mocks.torrentEngineRelease).not.toHaveBeenCalled();

    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.torrentEngineRelease).toHaveBeenCalledWith(
      "0123456789abcdef0123456789abcdef01234567",
      [4],
    );
  });

  it("hands the file back when the entry is removed mid-download", async () => {
    const id = await enqueueDownload({ meta, url: engineUrl });
    removeDownload(id);

    expect(mocks.torrentEngineRelease).toHaveBeenCalledWith(
      "0123456789abcdef0123456789abcdef01234567",
      [4],
    );
  });

  it("leaves a plain HTTP download alone", async () => {
    const id = await enqueueDownload({ meta, url: "https://cdn.example/video.mkv" });
    removeDownload(id);

    expect(mocks.torrentEngineRelease).not.toHaveBeenCalled();
  });
});

describe("download concurrency", () => {
  function startable() {
    let finish = () => {};
    const handle = { promise: new Promise<void>((res) => (finish = res)), abort: vi.fn() };
    return { handle, finish };
  }

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

describe("removing a download", () => {
  it("deletes the file from disk, not just the entry", async () => {
    mocks.startDownload.mockReturnValue({ promise: new Promise(() => {}), abort: vi.fn() });

    const id = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{
      id: string;
      path: string;
    }>;
    const path = saved.find((d) => d.id === id)?.path;

    removeDownload(id);

    expect(mocks.removeDownloadFile).toHaveBeenCalledWith(path);
  });

  it("survives a delete the filesystem refuses", async () => {
    mocks.startDownload.mockReturnValue({ promise: new Promise(() => {}), abort: vi.fn() });
    mocks.removeDownloadFile.mockRejectedValue(new Error("permission denied"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const id = await enqueueDownload({ meta, url: "https://cdn/a.mkv" });
    expect(() => removeDownload(id)).not.toThrow();

    const saved = JSON.parse(store.get("harbor.downloads.v1") ?? "[]") as Array<{ id: string }>;
    expect(saved.find((d) => d.id === id)).toBeUndefined();
  });
});
