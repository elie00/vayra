import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: vi.fn() }));

import { downloadFileExists } from "./video-download";

describe("download destination checks", () => {
  it.each([true, false])("returns a confirmed filesystem result: %s", async (exists) => {
    invoke.mockResolvedValueOnce(exists);
    await expect(downloadFileExists("/dl/video.mkv")).resolves.toBe(exists);
    expect(invoke).toHaveBeenLastCalledWith("download_file_exists", { path: "/dl/video.mkv" });
  });

  it("does not turn an unavailable filesystem into permission to overwrite", async () => {
    invoke.mockRejectedValueOnce(new Error("permission denied"));
    await expect(downloadFileExists("/dl/video.mkv")).rejects.toThrow("permission denied");
  });
});
