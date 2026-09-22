import { beforeEach, expect, it, vi } from "vitest";
import type { DownloadItem } from "./downloads-store";
import { completedDownloadFor, validatedDownloadSource } from "./offline-playback";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => mocks);
beforeEach(() => mocks.invoke.mockReset().mockResolvedValue(true));
const item: DownloadItem = { id: "d1", metaId: "tt123", title: "Film", subtitle: null, poster: null, season: null, episode: null, streamLabel: null, url: "https://example.invalid/movie", path: "/Downloads/movie.mkv", status: "done", receivedBytes: 1000, totalBytes: 1000, ratio: 1, bytesPerSec: 0, error: null, startedAt: 0 };
it("only chooses a completed copy of the requested movie or exact episode", () => {
  expect(completedDownloadFor([{ ...item, status: "paused" }], "tt123")).toBeUndefined();
  const episode = { ...item, season: 2, episode: 3 };
  expect(completedDownloadFor([episode], "tt123")).toBeUndefined();
  expect(completedDownloadFor([episode], "tt123", { season: 2, episode: 4 })).toBeUndefined();
  expect(completedDownloadFor([episode], "tt123", { season: 2, episode: 3 })).toBe(episode);
});
it("validates the file size natively before preparing local playback", async () => {
  expect(await validatedDownloadSource(item)).toMatchObject({ url: item.path, resume: true, notWebReady: true });
  expect(mocks.invoke).toHaveBeenCalledWith("download_file_valid", { path: item.path, expectedBytes: 1000 });
});
it("refuses partial and mismatched downloads without touching the engine", async () => {
  for (const d of [{ ...item, path: item.path + ".part" }, { ...item, receivedBytes: 500 }, { ...item, status: "downloading" as const }]) {
    expect(await validatedDownloadSource(d)).toBeNull();
  }
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("falls back safely when a file has disappeared or native validation fails", async () => {
  mocks.invoke.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("unavailable"));
  expect(await validatedDownloadSource(item)).toBeNull();
  expect(await validatedDownloadSource(item)).toBeNull();
});
