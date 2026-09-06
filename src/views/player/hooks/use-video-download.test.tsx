// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { useVideoDownload } from "./use-video-download";

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

type Props = { url: string; headers?: Record<string, string>; meta: Meta };
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
  mocks.save.mockReset().mockResolvedValue("/Downloads/Test film.mkv");
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
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
  await act(async () => root.render(<Harness url="https://example.invalid/next.mkv" headers={{ Authorization: "next-test-token" }} meta={meta} />));
  await act(async () => { download.reset(); await download.start(); });
  expect(requests()[1]).toMatchObject({ url: "https://example.invalid/next.mkv", headers: { Authorization: "next-test-token" } });
});

it("keeps public downloads free of authentication headers", async () => {
  await act(async () => root.render(<Harness url="https://example.invalid/public.mkv" meta={meta} />));
  await act(async () => download.start());
  expect(requests()[0].headers).toBeNull();
});
