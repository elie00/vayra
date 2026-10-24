// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerStatus } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";

const sendPlayerEvent = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/addon-events", () => ({ sendPlayerEvent }));
vi.mock("@/lib/player/playback-clock", () => ({ getPlaybackPosition: () => 120 }));

import { useAddonPlayerEvents } from "./use-addon-player-events";

const episode = {
  meta: { id: "tt0903747", type: "series", name: "Breaking Bad" },
  url: "http://127.0.0.1/stream/0",
  title: "Pilot",
  episode: { season: 1, episode: 2, imdbSeason: 1, imdbEpisode: 2 },
} as unknown as PlayerSrc;
const localFile = {
  meta: { id: "local:/Users/me/Film.mkv", type: "movie", name: "Film" },
  url: "/Users/me/Film.mkv",
  title: "Film",
} as unknown as PlayerSrc;

function mount(src: PlayerSrc, cast = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const render = (status: PlayerStatus, durationSec = 2820) =>
    act(() => root.render(<Probe src={src} status={status} durationSec={durationSec} cast={cast} />));
  return { render, unmount: () => act(() => root.unmount()) };
}

function Probe({ src, status, durationSec, cast }: { src: PlayerSrc; status: PlayerStatus; durationSec: number; cast: boolean }) {
  useAddonPlayerEvents({
    src,
    snap: { status, durationSec },
    resolvedImdbId: null,
    resolvedImdbVerified: false,
    castActiveRef: { current: cast },
  });
  return null;
}

const actions = () => sendPlayerEvent.mock.calls.map((c) => (c as unknown[])[2]);

afterEach(() => {
  sendPlayerEvent.mockClear();
  vi.unstubAllGlobals();
});

it("sends start, pause and stop once each, for the episode's video id", () => {
  const p = mount(episode);
  p.render("loading", 0);
  p.render("playing");
  p.render("playing", 2821);
  p.render("paused");
  p.unmount();
  expect(actions()).toEqual(["start", "pause", "stop"]);
  expect(sendPlayerEvent).toHaveBeenCalledWith("series", "tt0903747:1:2", "pause", 120, 2820);
});

it("does not stop a video that played to the end", () => {
  const p = mount(episode);
  p.render("playing");
  p.render("ended");
  p.unmount();
  expect(actions()).toEqual(["start"]);
});

it("keeps local files and casts to itself", () => {
  const local = mount(localFile);
  local.render("playing");
  local.unmount();
  const cast = mount(episode, true);
  cast.render("paused");
  cast.unmount();
  expect(sendPlayerEvent).not.toHaveBeenCalled();
});
