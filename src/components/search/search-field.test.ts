// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";

afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; delete document.documentElement.dataset.os; });

it("moves Mac search focus to the rounded wrapper without removing other focus indicators", () => {
  document.documentElement.dataset.os = "macos";
  const style = document.createElement("style");
  // jsdom does not resolve selector specificity like a browser, so test the
  // focused states with the base rule first; native WebKit QA checks the cascade.
  style.textContent = "input:focus-visible, button:focus-visible { outline: 2px solid red !important; outline-offset: 2px; }\n" +
    readFileSync("src/components/search/search-field.css", "utf8");
  document.head.append(style);
  const field = document.createElement("div");
  field.dataset.searchField = "";
  field.style.borderRadius = "28px";
  const input = document.createElement("input");
  const clear = document.createElement("button");
  field.append(input, clear);
  const other = document.createElement("input");
  document.body.append(field, other);
  input.focus();
  const focusRule = style.sheet!.cssRules[1] as CSSStyleRule;
  expect(input.matches(focusRule.selectorText)).toBe(true);
  expect(focusRule.style.getPropertyPriority("outline")).toBe("important");
  expect(getComputedStyle(input).outline).toBe("none");
  expect(field.matches(":has(> input:focus-visible)")).toBe(true);
  expect(getComputedStyle(field).boxShadow).toContain("inset");
  expect(getComputedStyle(field).borderRadius).toBe("28px");
  clear.focus();
  expect(getComputedStyle(clear).outline).toContain("2px");
  other.focus();
  expect(getComputedStyle(other).outline).toContain("2px");
  expect(field.matches(":has(> input:focus-visible)")).toBe(false);
  document.documentElement.dataset.os = "web";
  input.focus();
  expect(getComputedStyle(input).outline).toContain("2px");
});

it("connects the real overlay to the focus styling and permits the input to shrink", () => {
  const source = readFileSync("src/components/search/search-overlay.tsx", "utf8");
  expect(source).toContain('import "./search-field.css"');
  expect(source).toContain('data-search-field=""');
  expect(source).toContain("h-16 min-w-0 flex-1 bg-transparent");
});
