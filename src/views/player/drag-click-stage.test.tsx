// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DragClickStage } from "./drag-click-stage";

afterEach(() => vi.unstubAllGlobals());

function mount(onTouchTap?: () => void, seek?: (delta: number) => void) {
  const touchTap = onTouchTap ? { start: vi.fn(), end: onTouchTap, seek } : undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onClick = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<DragClickStage drawMode={false} pipMode={false} onClick={onClick} onDoubleClick={vi.fn()} touchTap={touchTap} />));
  const stage = host.firstElementChild as HTMLElement;
  return { stage, onClick, root };
}

function tap(stage: HTMLElement, x = 50, at = 0) {
  const up = new Event("pointerup", { bubbles: true });
  Object.defineProperty(up, "pointerType", { value: "touch" });
  Object.defineProperty(up, "clientX", { value: x });
  Object.defineProperty(up, "timeStamp", { value: at });
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

it("skips 10 seconds on a double tap on either side", () => {
  const onTouchTap = vi.fn();
  const seek = vi.fn();
  const { stage, root } = mount(onTouchTap, seek);
  stage.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  act(() => tap(stage, 90, 1000));
  act(() => tap(stage, 88, 1200));
  expect(seek).toHaveBeenCalledWith(10);
  act(() => tap(stage, 10, 3000));
  act(() => tap(stage, 12, 3150));
  expect(seek).toHaveBeenCalledWith(-10);
  // The first tap of each pair still shows or hides the controls; the second only skips.
  expect(onTouchTap).toHaveBeenCalledTimes(2);
  act(() => tap(stage, 50, 5000));
  act(() => tap(stage, 50, 5100));
  expect(seek).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

it("moves the volume on a vertical swipe on the right half", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const write = vi.fn();
  const onTouchTap = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <DragClickStage
        drawMode={false}
        pipMode={false}
        onClick={vi.fn()}
        onDoubleClick={vi.fn()}
        touchTap={{ start: vi.fn(), end: onTouchTap }}
        volume={{ read: () => 0.5, write }}
      />,
    ),
  );
  const stage = host.firstElementChild as HTMLElement;
  stage.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const ev = (type: string, x: number, y: number) => {
    const e = new Event(type, { bubbles: true });
    Object.defineProperties(e, { pointerType: { value: "touch" }, pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y } });
    stage.dispatchEvent(e);
  };
  act(() => ev("pointerdown", 300, 150));
  act(() => ev("pointermove", 302, 80));
  expect(write).toHaveBeenLastCalledWith(1);
  act(() => ev("pointerup", 302, 80));
  // A swipe is not a tap: the controls stay as they were.
  expect(onTouchTap).not.toHaveBeenCalled();
  // The left half belongs to taps and double taps.
  write.mockClear();
  act(() => ev("pointerdown", 100, 150));
  act(() => ev("pointermove", 100, 60));
  expect(write).not.toHaveBeenCalled();
  act(() => root.unmount());
});
