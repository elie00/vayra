// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { CardHoverOverlay } from "./card-hover";
import { CustomHoverOverlay } from "./custom-hover";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/watchlist", () => ({ toggleWatchlist: vi.fn(), useInWatchlist: () => false }));
vi.mock("@/lib/mark-watched", () => ({ markMovieWatched: vi.fn(async () => undefined) }));

afterEach(() => vi.unstubAllGlobals());

const meta = { id: "tt0111161", type: "movie", name: "The Shawshank Redemption" } as Meta;
const custom = { showPlay: true, showTitle: true, showMeta: false, overlay: "gradient" } as Parameters<typeof CustomHoverOverlay>[0]["config"];

function render(node: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, unmount: () => act(() => root.unmount()) };
}

it.each([
  ["elegant", ["Play", "Mark watched", "Add to watchlist"]],
  ["frosted", ["Play"]],
  ["cinema", ["Play"]],
] as const)("%s card actions are buttons that Tab reaches and arrows skip", (style, labels) => {
  const onPlay = vi.fn();
  const { host, unmount } = render(<CardHoverOverlay meta={meta} style={style} onPlay={onPlay} />);
  const buttons = [...host.querySelectorAll("button")];
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(labels);
  expect(buttons.every((b) => b.type === "button" && b.hasAttribute("data-spatial-skip"))).toBe(true);
  expect(host.querySelector('[role="button"]')).toBeNull();
  act(() => buttons[0].click());
  expect(onPlay).toHaveBeenCalledOnce();
  unmount();
});

it("custom hover play is a button", () => {
  const { host, unmount } = render(<CustomHoverOverlay config={custom} meta={meta} onPlay={() => {}} />);
  expect([...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Play"]);
  unmount();
});

it("settings previews draw the actions without any control", () => {
  for (const node of [
    <CardHoverOverlay meta={meta} style="elegant" onPlay={() => {}} preview />,
    <CardHoverOverlay meta={meta} style="frosted" onPlay={() => {}} preview />,
    <CustomHoverOverlay config={custom} meta={meta} onPlay={() => {}} preview />,
  ]) {
    const { host, unmount } = render(node);
    expect(host.querySelectorAll('button, [role="button"]')).toHaveLength(0);
    unmount();
  }
});
