// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { DEFAULT } from "@/lib/settings/defaults";
import { PickCard } from "./pick-card";

const openMeta = vi.fn();
const openPicker = vi.fn();
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, useLang: () => "en" }));
vi.mock("@/lib/view", () => ({ useView: () => ({ openMeta, openPicker }) }));
vi.mock("@/lib/context-menu", () => ({ useContextMenu: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: { ...DEFAULT, hoverPreviewEnabled: true, cardHoverStyle: "elegant" }, update: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

it("puts the hover actions beside the card button, where they can take focus", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const meta = { id: "tt0111161", type: "movie", name: "The Shawshank Redemption", poster: "p.jpg" } as Meta;
  act(() => root.render(<PickCard meta={meta} />));

  const actions = [...host.querySelectorAll<HTMLButtonElement>("[data-spatial-skip]")];
  expect(actions.map((b) => b.getAttribute("aria-label"))).toEqual(["Play", "Mark watched", "Add to watchlist"]);
  expect(actions.every((b) => b.parentElement?.closest("button") === null)).toBe(true);

  act(() => actions[0].click());
  expect(openPicker).toHaveBeenCalledWith(meta, undefined, { autoPlay: true, resume: true });
  expect(openMeta).not.toHaveBeenCalled();

  act(() => root.unmount());
  host.remove();
});
