// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class { onmessage = (_event: unknown) => {}; },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));
vi.mock("@tauri-apps/api/path", () => ({ downloadDir: async () => "/Downloads" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { downloadDir: "/Downloads" } }) }));
vi.mock("@/lib/platform", () => ({ pathSeparator: () => "/" }));

type Request = {
  id: string;
  url: string;
  dest: string;
  onEvent: { onmessage: (event: { kind: string; [key: string]: unknown }) => void };
};
const hash = "0123456789abcdef0123456789abcdef01234567";
const url = `http://127.0.0.1:11470/stream/${hash}/12`;
const meta: Meta = { id: "retention-film", name: "Retention film", type: "movie" };
let store: typeof import("@/lib/download/downloads-store");
let engine: typeof import("@/lib/torrent/local-engine");
let useVideoDownload: typeof import("./use-video-download").useVideoDownload;
let download: ReturnType<typeof useVideoDownload>;
let root: Root | null = null;
const calls = (command: string) => mocks.invoke.mock.calls.filter(([name]) => name === command);
const requests = () => calls("download_start").map(([, args]) => args as Request);

function PlayerHarness() {
  download = useVideoDownload({ url, meta });
  // The same lifetime contract as usePlayerMedia, with all transfer/store/engine
  // code real. Only the native IPC boundary and the Save dialog are simulated.
  useEffect(() => {
    engine.cancelTorrentRemoval(hash);
    return () => engine.scheduleTorrentRemoval(hash, true);
  }, []);
  return null;
}
async function mountPlayer() {
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(<PlayerHarness />));
}
async function closePlayer() {
  await act(async () => root?.unmount());
  root = null;
  await act(async () => vi.advanceTimersByTimeAsync(1200));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  localStorage.clear();
  mocks.invoke.mockReset().mockImplementation(async (command: string) => command === "download_file_exists" ? false : undefined);
  mocks.save.mockReset().mockResolvedValue("/Downloads/Retention film.mkv");
  store = await import("@/lib/download/downloads-store");
  engine = await import("@/lib/torrent/local-engine");
  ({ useVideoDownload } = await import("./use-video-download"));
  store.configureDownloads({ concurrent: 1, quotaGiB: 0 });
});
afterEach(async () => {
  await act(async () => {
    root?.unmount();
    root = null;
    for (const item of store.downloadSnapshot()) store.removeDownload(item.id);
    for (const request of requests()) request.onEvent.onmessage({ kind: "canceled", received: 0 });
  });
  engine.cancelTorrentRemoval(hash);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps a queued player transfer through exit, pause and resume, then releases only after completion", async () => {
  await store.enqueueDownload({ meta: { ...meta, id: "slot-blocker" }, url: "https://example.invalid/blocker.mkv" });
  const blocker = requests()[0];
  await mountPlayer();
  await act(async () => download.start());
  const item = store.downloadSnapshot().find((entry) => entry.metaId === meta.id)!;
  expect(item.status).toBe("queued");
  expect(download.status.kind).toBe("queued");
  expect(requests()).toHaveLength(1);
  expect(calls("torrent_engine_select_many")).not.toHaveLength(0);

  await closePlayer();
  store.pauseDownload(item.id);
  await act(async () => blocker.onEvent.onmessage({ kind: "done", received: 1000 }));
  expect(calls("torrent_engine_remove")).toHaveLength(0);
  expect(calls("torrent_engine_release")).toHaveLength(0);
  expect(store.downloadSnapshot().find((entry) => entry.id === item.id)?.status).toBe("paused");

  await mountPlayer();
  expect(download.status.kind).toBe("paused");
  await act(async () => download.resume());
  const first = requests().find((request) => request.id === item.id)!;
  expect(first).toMatchObject({ id: item.id, url, dest: item.path });
  await act(async () => first.onEvent.onmessage({ kind: "progress", received: 250, total: 1000 }));
  await closePlayer();
  await act(async () => {
    store.pauseDownload(item.id);
    first.onEvent.onmessage({ kind: "canceled", received: 250 });
  });
  expect(store.downloadSnapshot().find((entry) => entry.id === item.id)).toMatchObject({ status: "paused", receivedBytes: 250 });
  expect(calls("torrent_engine_release")).toHaveLength(0);
  expect(calls("torrent_engine_remove")).toHaveLength(0);

  await act(async () => store.resumeDownload(item.id));
  const resumed = requests().at(-1)!;
  expect(resumed).toMatchObject({ id: item.id, url, dest: item.path });
  await act(async () => resumed.onEvent.onmessage({ kind: "done", received: 1000 }));
  expect(store.downloadSnapshot().find((entry) => entry.id === item.id)).toMatchObject({ status: "done", receivedBytes: 1000 });
  expect(calls("torrent_engine_release")).toEqual([["torrent_engine_release", { infoHash: hash, fileIdxs: [12] }]]);
  expect(calls("torrent_engine_remove")).toEqual([["torrent_engine_remove", { infoHash: hash, deleteFiles: true }]]);
});

it.each(["pause", "cancel"] as const)("preserves %s when pending native source selection rejects", async (action) => {
  let rejectSelection!: (error: Error) => void;
  let selectionCount = 0;
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "download_file_exists") return false;
    if (command === "torrent_engine_select_many" && ++selectionCount === 2) {
      return await new Promise<void>((_resolve, reject) => { rejectSelection = reject; });
    }
  });
  await mountPlayer();
  await act(async () => download.start());
  const item = store.downloadSnapshot().find((entry) => entry.metaId === meta.id)!;
  expect(item.status).toBe("downloading");
  expect(requests()).toHaveLength(0);
  await closePlayer();
  await act(async () => {
    if (action === "pause") store.pauseDownload(item.id);
    else store.cancelDownload(item.id);
    rejectSelection(new Error("native selection unavailable"));
  });
  expect(store.downloadSnapshot().find((entry) => entry.id === item.id)?.status)
    .toBe(action === "pause" ? "paused" : "canceled");
  expect(requests()).toHaveLength(0);
  expect(calls("torrent_engine_remove")).toHaveLength(action === "pause" ? 0 : 1);
});
