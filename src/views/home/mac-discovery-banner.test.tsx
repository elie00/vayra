// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { MacDiscoveryBanner } from "./mac-discovery-banner";

const view = { openMeta: vi.fn(), setView: vi.fn() };
vi.mock("@/lib/view", () => ({ useView: () => view }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

let host: HTMLDivElement;
let root: Root;

const slides: Meta[] = [
  { id: "tt1", type: "movie", name: "Dune: Part Two", releaseInfo: "2024", imdbRating: "8.5", genres: ["Sci-Fi", "Adventure"], description: "Arrakis rises." },
  { id: "tt2", type: "movie", name: "Arrival", releaseInfo: "2016", imdbRating: "7.9", genres: ["Drama"], description: "Language across time." },
];

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

describe("MacDiscoveryBanner", () => {
  it("cycles through discovery slides and routes detail and explore actions", () => {
    act(() => root.render(<MacDiscoveryBanner items={slides} />));
    expect(host.querySelector("h2")?.textContent).toBe("Dune: Part Two");
    expect(host.textContent).toContain("01 / 02");

    const next = host.querySelector<HTMLButtonElement>('button[aria-label="common.next"]')!;
    act(() => next.click());
    expect(host.querySelector("h2")?.textContent).toBe("Arrival");
    expect(host.textContent).toContain("02 / 02");

    const details = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("View details"),
    )!;
    act(() => details.click());
    expect(view.openMeta).toHaveBeenCalledWith(slides[1]);

    const explore = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Explore",
    )!;
    act(() => explore.click());
    expect(view.setView).toHaveBeenCalledWith("discover");
  });
});
