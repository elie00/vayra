// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const setTrickplayState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trickplay", () => ({
  setTrickplayState,
  trickplaySetUrl: vi.fn(async () => undefined),
  trickplaySpawnEager: vi.fn(async () => undefined),
  trickplayStop: vi.fn(async () => undefined),
}));

import { useTrickplay } from "./use-trickplay";

afterEach(() => vi.unstubAllGlobals());

function Probe({ url }: { url: string }) {
  useTrickplay({ url, enabled: true });
  return null;
}

it.each([
  ["VAYRA's engine", "http://127.0.0.1:52527/stream/3adac0d5dffe82db8637d7eaa7c3c25e8b10aeed/1"],
  ["the bundled Stremio server", "http://127.0.0.1:11470/3adac0d5dffe82db8637d7eaa7c3c25e8b10aeed/1"],
])("previews only the downloaded parts of a torrent from %s", async (_, url) => {
  // Previews of parts not downloaded yet made the engine fetch them before the
  // picture the player was waiting for.
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe url={url} />));
  expect(setTrickplayState).toHaveBeenLastCalledWith({ active: true, bufferedOnly: true });
  act(() => root.unmount());
});

it("previews any part of a direct link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe url="https://cdn.example.invalid/e01.mkv" />));
  expect(setTrickplayState).toHaveBeenLastCalledWith({ active: true, bufferedOnly: false });
  act(() => root.unmount());
});
