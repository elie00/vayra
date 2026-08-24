import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startDownload: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  downloadDir: vi.fn(),
  torrentEngineRelease: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ downloadDir: mocks.downloadDir }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: mocks.exists,
  mkdir: mocks.mkdir,
  remove: mocks.remove,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("./video-download", () => ({ startDownload: mocks.startDownload }));
vi.mock("@/lib/torrent/local-engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/torrent/local-engine")>()),
  torrentEngineRelease: mocks.torrentEngineRelease,
}));

import type { Meta } from "@/lib/cinemeta";
import { enqueueDownload, removeDownload } from "./downloads-store";

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
  mocks.exists.mockResolvedValue(false);
  mocks.remove.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
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
