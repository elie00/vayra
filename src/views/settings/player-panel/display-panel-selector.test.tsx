// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT } from "@/lib/settings/defaults";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { ...DEFAULT, playerDisplayPanel: "oled" }, update: vi.fn() }) }));

import { DisplayPanelSelector } from "./display-panel-selector";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("says which display panel is chosen", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<DisplayPanelSelector />));
  const pressed = [...host.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]);
  expect(pressed).toEqual([["Auto", "false"], ["OLED", "true"], ["LCD", "false"]]);
  act(() => root.unmount());
});
