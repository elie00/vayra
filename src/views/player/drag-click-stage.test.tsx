// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DragClickStage } from "./drag-click-stage";

afterEach(() => vi.unstubAllGlobals());

function mount(onTouchTap?: () => void) {
  const touchTap = onTouchTap ? { start: vi.fn(), end: onTouchTap } : undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onClick = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<DragClickStage drawMode={false} pipMode={false} onClick={onClick} onDoubleClick={vi.fn()} touchTap={touchTap} />));
  const stage = host.firstElementChild as HTMLElement;
  return { stage, onClick, root };
}

function tap(stage: HTMLElement) {
  const up = new Event("pointerup", { bubbles: true });
  Object.defineProperty(up, "pointerType", { value: "touch" });
  stage.dispatchEvent(up);
  // What the browser synthesises after the touch.
  stage.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

it("toggles the controls on a phone tap instead of playing or pausing", () => {
  const onTouchTap = vi.fn();
  const { stage, onClick, root } = mount(onTouchTap);
  act(() => tap(stage));
  expect(onTouchTap).toHaveBeenCalledTimes(1);
  expect(onClick).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("keeps click to play or pause with a mouse", () => {
  const { stage, onClick, root } = mount();
  act(() => {
    stage.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  expect(onClick).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});
