// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Row } from "./row";

vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { posterScale: 1, rowTitleScale: 1 } }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
const view = { rememberRowScroll: vi.fn(), recallRowScroll: () => 0 };
vi.mock("@/lib/view", () => ({ useView: () => view }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("does not feed changing WebKit layout measurements back into synchronous renders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let reads = 0;
  // During a sidebar transition WebKit may return a different rounded width
  // on each layout read. The old cellWidth-dependent effect never settled.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("group/row") ? (++reads % 2 ? 900 : 901) : 940;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1800);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Row title="Continue" scrollKey="home:test"><div>Video</div></Row>));
    expect(reads).toBeLessThan(5);
    expect(host.querySelector(".harbor-row-track")?.getAttribute("style")).toContain("grid-auto-columns");
    await act(async () => root.render(<Row title="Continue" scrollKey="home:test"><div>Updated video</div></Row>));
    expect(reads).toBeLessThan(8);
    expect(host.textContent).toContain("Updated video");
  } finally { await act(async () => root.unmount()); }
});
