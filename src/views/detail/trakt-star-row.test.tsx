// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StarRow } from "./trakt-comments";

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));

afterEach(() => vi.unstubAllGlobals());

it("rates a Trakt title from the keyboard, one named button per half star", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onRate = vi.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<StarRow value={4} interactive onRate={onRate} />));

  const buttons = [...host.querySelectorAll("button")];
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
    Array.from({ length: 10 }, (_, i) => `Rate ${i + 1}/10`),
  );
  expect(buttons[3].getAttribute("aria-pressed")).toBe("true");
  act(() => buttons[8].click());
  expect(onRate).toHaveBeenCalledWith(9);

  act(() => root.render(<StarRow value={4} interactive={false} />));
  expect(host.querySelectorAll("button")).toHaveLength(0);
  act(() => root.unmount());
});
