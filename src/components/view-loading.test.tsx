// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ViewLoading } from "./view-loading";
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

it("shows a status only for a slow import and cancels the timer on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ViewLoading />));
    expect(container.textContent).toBe("");
    await act(async () => vi.advanceTimersByTime(250));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading…");
  } finally {
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
