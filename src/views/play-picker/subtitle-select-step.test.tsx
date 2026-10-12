// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SubtitleSelectStep } from "./subtitle-select-step";
import type { PlayerSrc } from "@/lib/view";

const state = vi.hoisted(() => ({ loading: false }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, useUiLanguage: () => "en" }));
vi.mock("@/lib/use-window-fullscreen", () => ({ useWindowFullscreen: () => false }));
vi.mock("./backdrop-layer", () => ({ BackdropLayer: () => null }));
vi.mock("./hooks/use-subtitle-choices", () => ({ useSubtitleChoices: () => ({
  loading: state.loading, error: null, bestId: "fr",
  results: [{ id: "fr", url: "https://example.invalid/fr.srt", lang: "fr", title: "French" }], groups: [],
}) }));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); state.loading = false; vi.unstubAllGlobals(); });

it("confirms the selected subtitle once and ignores repeat, composition and modifiers", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  cleanup = async () => { await act(async () => root.unmount()); };
  const onStart = vi.fn();
  await act(async () => root.render(<SubtitleSelectStep src={{ meta: { name: "Fixture", id: "test", type: "movie" } } as PlayerSrc} onStart={onStart} onCancel={vi.fn()} />));
  for (const options of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { shiftKey: true }]) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ...options }));
  }
  expect(onStart).not.toHaveBeenCalled();
  const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
  window.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart.mock.calls[0][0].subtitlePreselect).toEqual({ off: false, url: "https://example.invalid/fr.srt", lang: "fr", title: "French" });
});

it("does not start while subtitle choices are loading", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.loading = true;
  const root = createRoot(document.createElement("div"));
  cleanup = async () => { await act(async () => root.unmount()); };
  const onStart = vi.fn();
  await act(async () => root.render(<SubtitleSelectStep src={{ meta: { name: "Fixture", id: "test", type: "movie" } } as PlayerSrc} onStart={onStart} onCancel={vi.fn()} />));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(onStart).not.toHaveBeenCalled();
});
