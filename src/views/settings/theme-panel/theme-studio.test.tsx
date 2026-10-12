// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useKeyboardNavigation } from "@/lib/keyboard-navigation";
import { ThemeStudio } from "./theme-studio";

vi.mock("@/lib/sfx", () => ({ SFX: { close: vi.fn() } }));

const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("@/lib/theme", async (original) => ({ ...(await original<typeof import("@/lib/theme")>()), applyTheme: mocks.apply }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { theme: { preset: "cool-grey" } }, update: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/overlay-pin", () => ({ pushOverlayPin: () => () => {} }));
vi.mock("@/lib/discord/activity-hint", () => ({ pushActivityHint: () => () => {} }));
vi.mock("./theme-studio/hooks/use-studio-preview", async () => {
  const { useState } = await import("react");
  return { useStudioPreview: () => {
    const [inspectorHidden, setInspectorHidden] = useState(false);
    return { inspectorHidden, setInspectorHidden };
  } };
});
vi.mock("./theme-studio/inspector", () => ({ Inspector: ({ onPatch }: { onPatch: (patch: { name: string }) => void }) => <button onClick={() => onPatch({ name: "Fixture" })}>Rename</button> }));
vi.mock("./theme-studio/code-popout", () => ({ CodePopout: () => null }));

it("does not reapply the global theme on rename and protects unsaved work with a focus-trapped dialog", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) { return this.parentElement; });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); const close = vi.fn();
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent === label || b.getAttribute("aria-label") === label))!;
  try {
    mocks.apply.mockClear();
    await act(async () => root.render(<ThemeStudio onClose={close} />));
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    await act(async () => button("Rename").click());
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    button("Close studio").focus();
    await act(async () => button("Close studio").click());
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(button("Keep editing"));
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(close).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("Close studio"));
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

it("removes the minimized inspector from keyboard navigation and restores focus without closing during composition", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); const close = vi.fn();
  const back = vi.fn();
  function Harness() {
    useKeyboardNavigation({ onBack: back });
    return <ThemeStudio onClose={close} />;
  }
  const minimize = () => document.querySelector<HTMLButtonElement>('[aria-label="Minimize panel"]')!;
  try {
    await act(async () => root.render(<Harness />));
    minimize().focus();
    await act(async () => minimize().click());
    expect(minimize().closest("[inert]")).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Edit theme");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })));
    expect(minimize().closest("[inert]")).not.toBeNull();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(minimize().closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(minimize());
    expect(close).not.toHaveBeenCalled();
    const consumed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    consumed.preventDefault();
    await act(async () => minimize().dispatchEvent(consumed));
    expect(close).not.toHaveBeenCalled();
    await act(async () => minimize().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
