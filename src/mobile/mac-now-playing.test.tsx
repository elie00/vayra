// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ConnectState } from "@/lib/connect/host";
import { NO_LINK, setLinkStatus } from "@/lib/connect/link";
import { MacNowPlayingBar, MacRemoteSheet } from "./mac-now-playing";
import { closeMacRemote, isMacRemoteOpen, openMacRemote } from "./mac-remote";

const invoke = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const mac = { name: "MacBook", address: "192.168.1.85:11472" };
const state: ConnectState = {
  status: "playing",
  positionSec: 754,
  durationSec: 2820,
  rate: 1,
  volume: 0.8,
  muted: false,
  title: "Breaking Bad · S1E1 · Pilot",
  meta: { id: "tt0903747", type: "series", name: "Breaking Bad" },
  episode: { season: 1, episode: 1 },
  at: Date.now(),
};

afterEach(() => {
  act(() => {
    setLinkStatus(NO_LINK);
    closeMacRemote();
  });
  invoke.mockClear();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <>
        <MacNowPlayingBar />
        <MacRemoteSheet />
      </>,
    ),
  );
  return () => act(() => root.unmount());
}

const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const sent = () => invoke.mock.calls.map((call) => (call as unknown[])[1]);

it("shows what the Mac plays above the tab bar and pauses it", () => {
  const unmount = render();
  expect(document.body.textContent).toBe("");
  act(() => setLinkStatus({ mac, connected: true, state }));
  expect(document.body.textContent).toContain("Breaking Bad · S1E1 · Pilot");
  expect(document.documentElement.dataset.macBar).toBe("1");

  act(() => button("Pause").click());
  expect(invoke).toHaveBeenCalledWith("connect_link_send", { message: { type: "command", action: "pause" } });

  act(() => setLinkStatus({ mac, connected: false, state: null }));
  expect(document.body.textContent).toBe("");
  expect(document.documentElement.dataset.macBar).toBeUndefined();
  unmount();
});

it("drives the Mac from the remote", () => {
  const unmount = render();
  act(() => setLinkStatus({ mac, connected: true, state }));
  act(() => button("Open the remote for MacBook").click());
  expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Remote for MacBook");

  const seek = document.querySelector<HTMLInputElement>('input[aria-label="Position"]')!;
  act(() => {
    seek.value = "1200";
    seek.dispatchEvent(new Event("change", { bubbles: true }));
  });
  act(() => button("Back 10 seconds").click());
  act(() => button("Forward 10 seconds").click());
  const volume = document.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
  act(() => {
    volume.value = "0.4";
    volume.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const stop = [...document.querySelectorAll("button")].find((b) => b.textContent === "Stop on the Mac")!;
  act(() => stop.click());

  expect(sent()).toEqual([
    { message: { type: "command", action: "seek", position: 1200 } },
    { message: { type: "command", action: "skip", seconds: -10 } },
    { message: { type: "command", action: "skip", seconds: 10 } },
    { message: { type: "command", action: "volume", level: 0.4 } },
    { message: { type: "command", action: "stop" } },
  ]);
  expect(isMacRemoteOpen()).toBe(false);
  unmount();
});

it("closes the remote when the Mac goes away", () => {
  const unmount = render();
  act(() => setLinkStatus({ mac, connected: true, state }));
  act(() => openMacRemote());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => setLinkStatus({ mac, connected: false, state: null }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(isMacRemoteOpen()).toBe(false);
  unmount();
});
