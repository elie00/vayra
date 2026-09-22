// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NavItem } from "./sidebar";
import { NAV_ITEMS } from "./nav-items";
import { readFileSync } from "node:fs";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/lib/download/downloads-store", () => ({ useActiveDownloadCount: () => 0 }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps one canvas without a divider or selected tile while retaining motion", () => {
  const css = readFileSync("src/styles/mac-ux.css", "utf8");
  expect(css).toContain("[data-mac-sidebar] { border-inline-end: 0; background: var(--color-canvas); }");
  expect(css).toContain("[data-vayra-nav][data-active] { background: transparent;");
  expect(css).not.toContain("[data-mac-sidebar]::after");
  expect(css).toContain(":hover [data-nav-icon]");
  expect(css).toContain(":focus-visible [data-nav-icon]");
  expect(css).toContain("prefers-reduced-motion: reduce");
});

it("gives every destination a motion target, including static icons", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<>{NAV_ITEMS.map((item) => <NavItem key={item.id} view={item.view} label={item.label} render={item.render} collapsed />)}</>));
    const targets = host.querySelectorAll("[data-nav-icon]");
    expect(targets).toHaveLength(NAV_ITEMS.length);
    for (const target of targets) expect(target.querySelector("svg")).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it("replays selected icon effects on every hover and keyboard focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const render = vi.fn((animated: boolean) => <svg data-animated={String(animated)} />);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<NavItem view="home" label="Home" render={render} active collapsed />));
    const button = host.querySelector("button")!;
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(render).toHaveBeenLastCalledWith(false);
    for (let i = 0; i < 2; i++) {
      await act(async () => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
      expect(render).toHaveBeenLastCalledWith(true);
      await act(async () => button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
      expect(render).toHaveBeenLastCalledWith(false);
    }
    vi.spyOn(button, "matches").mockReturnValue(true);
    await act(async () => button.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(render).toHaveBeenLastCalledWith(true);
    await act(async () => button.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(render).toHaveBeenLastCalledWith(false);
  } finally { await act(async () => root.unmount()); }
});
