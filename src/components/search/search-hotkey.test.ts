import { describe, expect, it } from "vitest";
import { matchesAppSearchShortcut } from "./search-hotkey";

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("macOS app search shortcut", () => {
  it("opens app search with Command+F on macOS", () => {
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", metaKey: true }), "/", true)).toBe(true);
  });

  it("keeps the configured shortcut on every platform", () => {
    expect(matchesAppSearchShortcut(keyEvent({ key: "/" }), "/", false)).toBe(true);
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", metaKey: true }), "/", false)).toBe(false);
  });
});
