// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { useVideoDownload } from "./use-video-download";
import { configureDownloads, downloadSnapshot, enqueueDownload, pauseDownload, removeDownload, resumeDownload } from "@/lib/download/downloads-store";
import { completedDownloadFor, validatedDownloadSource } from "@/lib/download/offline-playback";
import type { PlayEpisode } from "@/lib/view";

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

type Props = { url: string; headers?: Record<string, string>; meta: Meta; episode?: PlayEpisode };
type Request = {
  id: string;
  url: string;
  dest: string;
  headers: Record<string, string> | null;
  onEvent: { onmessage: (event: { kind: string; [key: string]: unknown }) => void };
};
let download: ReturnType<typeof useVideoDownload>;
let root: Root;
function Harness(props: Props) {
  download = useVideoDownload(props);
  return null;
}
function requests(): Request[] {
  return mocks.invoke.mock.calls.filter(([name]) => name === "download_start").map(([, args]) => args as Request);
}
const meta: Meta = { id: "tt123", name: "Test film", type: "movie" };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  mocks.invoke.mockImplementation(async (command: string) => command === "download_file_exists" ? false : command === "download_file_valid" ? true : undefined);
  mocks.save.mockReset().mockResolvedValue("/Downloads/Test film.mkv");
  root = createRoot(document.createElement("div"));
  configureDownloads({ concurrent: 3, quotaGiB: 0 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const item of downloadSnapshot()) removeDownload(item.id);
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("passes protected source headers through the real download transport", async () => {
  const headers = { Authorization: "test-token", Referer: "https://example.invalid/" };
  await act(async () => root.render(<Harness url="https://example.invalid/film.mkv" headers={headers} meta={meta} />));
  await act(async () => download.start());
  expect(requests()).toHaveLength(1);
  expect(requests()[0]).toMatchObject({ url: "https://example.invalid/film.mkv", headers });
});

it("resumes the original URL and copied headers when the playing source changes", async () => {
  const headers = { Authorization: "original-test-token" };
  await act(async () => root.render(<Harness url="https://example.invalid/original.mkv" headers={headers} meta={meta} />));
  await act(async () => download.start());
  const original = requests()[0];
  await act(async () => {
    original.onEvent.onmessage({ kind: "progress", received: 100, total: 1000 });
    download.pause();
    original.onEvent.onmessage({ kind: "canceled", received: 100 });
  });
  expect(download.status).toMatchObject({ kind: "paused", receivedBytes: 100 });
  headers.Authorization = "mutated-test-token";
  await act(async () => root.render(<Harness url="https://example.invalid/replacement.mkv" headers={{ Authorization: "other-test-token" }} meta={meta} />));
  await act(async () => download.resume());
  expect(requests()).toHaveLength(2);
  expect(requests()[1]).toMatchObject({
    id: original.id,
    dest: original.dest,
    url: "https://example.invalid/original.mkv",
    headers: { Authorization: "original-test-token" },
  });
});

it("captures headers when Save opens and uses fresh headers for the next download", async () => {
  const headers = { Authorization: "before-dialog-test-token" };
  let choosePath!: (path: string) => void;
  mocks.save.mockImplementationOnce(() => new Promise<string>((resolve) => { choosePath = resolve; }));
  await act(async () => root.render(<Harness url="https://example.invalid/original.mkv" headers={headers} meta={meta} />));
  let starting!: Promise<void>;
  await act(async () => { starting = download.start(); });
  headers.Authorization = "changed-during-dialog-test-token";
  await act(async () => { choosePath("/Downloads/original.mkv"); await starting; });
  expect(requests()[0].headers).toEqual({ Authorization: "before-dialog-test-token" });
  await act(async () => requests()[0].onEvent.onmessage({ kind: "done", received: 1000 }));
  await act(async () => root.render(<Harness url="https://example.invalid/next.mkv" headers={{ Authorization: "next-test-token" }} meta={{ ...meta, id: "tt-next" }} />));
  await act(async () => { download.reset(); await download.start(); });
  expect(requests()[1]).toMatchObject({ url: "https://example.invalid/next.mkv", headers: { Authorization: "next-test-token" } });
});

it("keeps public downloads free of authentication headers", async () => {
  await act(async () => root.render(<Harness url="https://example.invalid/public.mkv" meta={meta} />));
  await act(async () => download.start());
  expect(requests()[0].headers).toBeNull();
});

it("keeps a player transfer alive after unmount, and reattaches without starting a duplicate", async () => {
  const props = { url: "https://example.invalid/film.mkv", meta, episode: { season: 2, episode: 3 } };
  await act(async () => root.render(<Harness {...props} />));
  await act(async () => download.start());
  const request = requests()[0];
  await act(async () => request.onEvent.onmessage({ kind: "progress", received: 100, total: 1000 }));
  expect(downloadSnapshot()).toHaveLength(1);
  expect(downloadSnapshot()[0]).toMatchObject({ metaId: meta.id, season: 2, episode: 3, receivedBytes: 100 });
  await act(async () => root.unmount());
  expect(mocks.invoke.mock.calls.filter(([command]) => command === "download_cancel")).toHaveLength(0);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness {...props} />));
  expect(download.status).toMatchObject({ kind: "downloading", receivedBytes: 100 });
  await act(async () => download.start());
  expect(requests()).toHaveLength(1);
  expect(mocks.save).toHaveBeenCalledOnce();
  await act(async () => request.onEvent.onmessage({ kind: "done", received: 1000 }));
  expect(download.status).toMatchObject({ kind: "done", path: request.dest });
  const copy = completedDownloadFor([...downloadSnapshot()], meta.id, props.episode)!;
  expect((await validatedDownloadSource(copy))?.url).toBe(request.dest);
});

it("shares pause/resume with the central list and never attaches to another episode", async () => {
  const props = { url: "https://example.invalid/film.mkv", meta, episode: { season: 2, episode: 3 } };
  await act(async () => root.render(<Harness {...props} />));
  await act(async () => download.start());
  const request = requests()[0];
  await act(async () => {
    pauseDownload(request.id);
    request.onEvent.onmessage({ kind: "canceled", received: 0 });
  });
  expect(download.status.kind).toBe("paused");
  await act(async () => root.render(<Harness {...props} episode={{ season: 2, episode: 4 }} />));
  expect(download.status.kind).toBe("idle");
  await act(async () => root.render(<Harness {...props} />));
  expect(download.status.kind).toBe("paused");
  await act(async () => resumeDownload(request.id));
  expect(download.status.kind).toBe("downloading");
  expect(requests()[1].id).toBe(request.id);
});

it("shows central queuing and pauses before the transfer ever starts", async () => {
  configureDownloads({ concurrent: 1 });
  await enqueueDownload({ meta: { ...meta, id: "other" }, url: "https://example.invalid/other.mkv" });
  await act(async () => root.render(<Harness url="https://example.invalid/film.mkv" meta={meta} />));
  await act(async () => download.start());
  expect(download.status.kind).toBe("queued");
  expect(requests()).toHaveLength(1);
  await act(async () => download.pause());
  expect(download.status.kind).toBe("paused");
  await act(async () => download.resume());
  expect(download.status.kind).toBe("queued");
  expect(requests()).toHaveLength(1);
});

it("deduplicates rapid presses and cancels a pending Save when the player closes", async () => {
  let choosePath!: (path: string) => void;
  mocks.save.mockImplementation(() => new Promise<string>((resolve) => { choosePath = resolve; }));
  await act(async () => root.render(<Harness url="https://example.invalid/film.mkv" meta={meta} />));
  let first!: Promise<void>;
  await act(async () => { first = download.start(); void download.start(); });
  expect(mocks.save).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await act(async () => { choosePath("/Downloads/late.mkv"); await first; });
  expect(downloadSnapshot()).toHaveLength(0);
  expect(requests()).toHaveLength(0);
});

it("retries the same partial file after an error, without a new Save dialog", async () => {
  await act(async () => root.render(<Harness url="https://example.invalid/film.mkv" meta={meta} />));
  await act(async () => download.start());
  const request = requests()[0];
  await act(async () => request.onEvent.onmessage({ kind: "error", message: "Network unavailable" }));
  expect(download.status.kind).toBe("error");
  await act(async () => download.reset());
  expect(requests()[1]).toMatchObject({ id: request.id, dest: request.dest, url: request.url });
  expect(mocks.save).toHaveBeenCalledOnce();
});
