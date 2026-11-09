// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { CastDeviceInfo } from "@/lib/cast";
import { DEFAULT } from "@/lib/settings/defaults";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: DEFAULT, update }) }));

import { CastSessionBar } from "./cast-session-bar";

const tv = { id: "tv", name: "Samsung QN97AA 65 TV", kind: "dlna", host: "192.168.1.131", port: 0 } as unknown as CastDeviceInfo;

function mount(subtitles?: { applying: boolean; pending: boolean }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CastSessionBar
        device={tv}
        playing
        positionSec={1856}
        durationSec={7200}
        onTogglePlay={vi.fn()}
        onStop={vi.fn()}
        onSeek={vi.fn()}
        subtitles={subtitles}
      />,
    ),
  );
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="TV subtitles"]');
const panel = () => document.querySelector('[role="dialog"][aria-label="TV subtitles"]');

afterEach(() => {
  vi.unstubAllGlobals();
  update.mockClear();
});

it("offers TV subtitle settings only while subtitles are burned into the cast", () => {
  const unmount = mount();
  expect(trigger()).toBeNull();
  unmount();

  const unmountWithSubs = mount({ applying: false, pending: false });
  expect(trigger()).not.toBeNull();
  unmountWithSubs();
});

it("changes the TV subtitle size from the panel", () => {
  const unmount = mount({ applying: false, pending: false });
  act(() => trigger()!.click());
  expect(panel()).not.toBeNull();

  act(() => document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Larger"]')!.click());

  expect(update).toHaveBeenCalledWith({ castSubFontSize: DEFAULT.castSubFontSize + 2 });
  unmount();
});

it("closes the panel on Escape without the player also handling it", () => {
  const unmount = mount({ applying: false, pending: false });
  const playerShortcuts = vi.fn();
  window.addEventListener("keydown", playerShortcuts);
  act(() => trigger()!.click());

  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(panel()).toBeNull();
  expect(playerShortcuts).not.toHaveBeenCalled();
  window.removeEventListener("keydown", playerShortcuts);
  unmount();
});
