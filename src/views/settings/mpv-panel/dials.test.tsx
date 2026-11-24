// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TweakSlider } from "./dials";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("names each picture slider after its dial", async () => {
  await act(async () =>
    root.render(<TweakSlider tweaks={{}} setTweak={() => {}} mpvKey="gamma" label="Gamma (midtones)" min={-50} max={50} step={1} def={0} />),
  );
  expect(host.querySelector('input[type="range"]')?.getAttribute("aria-label")).toBe("Gamma (midtones)");
});
