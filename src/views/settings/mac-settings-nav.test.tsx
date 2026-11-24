// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MacSettingsNav } from "./mac-settings-nav";

const view = { goBack: vi.fn(), canGoBack: true, setView: vi.fn() };
vi.mock("@/lib/view", () => ({ useView: () => view }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("MacSettingsNav", () => {
  it("expands child sections for the active group and marks the active route", () => {
    const onChange = vi.fn();
    act(() => root.render(<MacSettingsNav active="hotkeys" onChange={onChange} />));
    const current = host.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    expect(current?.textContent).toContain("Hotkeys");
    const playback = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("Playback"),
    );
    expect(playback?.getAttribute("aria-expanded")).toBe("true");
  });

  it("supports keyboard arrow selection, Enter, and Escape in settings search", () => {
    const onChange = vi.fn();
    act(() => root.render(<MacSettingsNav active="basics" onChange={onChange} />));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "subtitles");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(input.value).toBe("");

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "subtitles");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });
});
