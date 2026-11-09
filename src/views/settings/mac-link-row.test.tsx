// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NO_LINK, setLinkStatus } from "@/lib/connect/link";
import { MacLinkRow } from "./mac-link-row";

const invoke = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  act(() => setLinkStatus(NO_LINK));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<MacLinkRow />));
  return { container, unmount: () => act(() => root.unmount()) };
}

const mac = { name: "MacBook", address: "192.168.1.85:11472" };

it("explains how to pair until a Mac is paired", () => {
  const { container, unmount } = render();
  expect(container.textContent).toContain("turn on VAYRA Connect");
  act(() => setLinkStatus({ mac, connected: false, state: null }));
  expect(container.textContent).toContain("MacBook");
  expect(container.textContent).toContain("Looking for your Mac");
  unmount();
});

it("shows what the Mac plays, moving on each second", () => {
  vi.useFakeTimers({ now: 10_000 });
  const { container, unmount } = render();
  act(() =>
    setLinkStatus({
      mac,
      connected: true,
      state: {
        status: "playing",
        positionSec: 754,
        durationSec: 2820,
        rate: 1,
        volume: 1,
        muted: false,
        title: "Breaking Bad · S1E1 · Pilot",
        meta: { id: "tt0903747", type: "series", name: "Breaking Bad" },
        episode: { season: 1, episode: 1 },
        at: 10_000,
      },
    }),
  );
  expect(container.textContent).toContain("Breaking Bad · S1E1 · Pilot");
  expect(container.textContent).toContain("Playing · 12:34 / 47:00");
  act(() => vi.advanceTimersByTime(2_000));
  expect(container.textContent).toContain("12:36 / 47:00");
  unmount();
});

it("forgets the Mac", () => {
  const { container, unmount } = render();
  act(() => setLinkStatus({ mac, connected: true, state: null }));
  expect(container.textContent).toContain("Nothing playing on the Mac");
  const forget = [...container.querySelectorAll("button")].find((b) => b.textContent === "Forget this Mac")!;
  act(() => forget.click());
  expect(invoke).toHaveBeenCalledWith("connect_link_forget");
  unmount();
});
