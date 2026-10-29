// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { installAndroidInsets } from "./android-insets";

const root = document.documentElement;

afterEach(() => {
  delete window.VayraInsets;
  delete window.__VAYRA_INSETS__;
  root.removeAttribute("style");
});

it("takes the bars the activity measured before the page loaded", () => {
  window.VayraInsets = { read: () => '{"top":24,"bottom":48}' };
  installAndroidInsets();
  expect(root.style.getPropertyValue("--vayra-inset-top")).toBe("24px");
  expect(root.style.getPropertyValue("--vayra-inset-bottom")).toBe("48px");
});

it("follows later changes and waits while nothing is measured", () => {
  window.VayraInsets = { read: () => "" };
  installAndroidInsets();
  expect(root.style.getPropertyValue("--vayra-inset-top")).toBe("");
  window.__VAYRA_INSETS__?.({ top: 24, bottom: 16 });
  expect(root.style.getPropertyValue("--vayra-inset-bottom")).toBe("16px");
});
