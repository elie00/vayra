// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SimklRatingPicker } from "./simkl-rating-picker";

const addSimklRating = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));
vi.mock("@/lib/simkl/ratings", () => ({
  addSimklRating,
  removeSimklRating: vi.fn(async () => true),
  getCachedRatingByTarget: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

it("rates from the keyboard, one named button per half star", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<SimklRatingPicker harborId="tt0111161" type="movie" simklConnected />));

  const buttons = [...host.querySelectorAll("button")];
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
    Array.from({ length: 10 }, (_, i) => `Rate ${i + 1}/10`),
  );
  expect(buttons.every((b) => b.type === "button")).toBe(true);

  await act(async () => buttons[6].click());
  expect(addSimklRating).toHaveBeenCalledWith(expect.anything(), 7);
  expect(buttons[6].getAttribute("aria-pressed")).toBe("true");

  act(() => root.unmount());
  host.remove();
});
