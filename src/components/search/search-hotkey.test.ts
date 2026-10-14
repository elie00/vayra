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

describe("desktop app search shortcut", () => {
  it("opens app search with Command+F on macOS", () => {
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", metaKey: true }), "/", "mac")).toBe(true);
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", ctrlKey: true }), "/", "mac")).toBe(false);
  });

  it("opens app search with Ctrl+F on Windows", () => {
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", ctrlKey: true }), "/", "windows")).toBe(true);
    expect(matchesAppSearchShortcut(keyEvent({ key: "F", ctrlKey: true, shiftKey: true }), "/", "windows")).toBe(false);
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", metaKey: true }), "/", "windows")).toBe(false);
  });

  it("keeps the configured shortcut on every platform", () => {
    expect(matchesAppSearchShortcut(keyEvent({ key: "/" }), "/", null)).toBe(true);
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", metaKey: true }), "/", null)).toBe(false);
    expect(matchesAppSearchShortcut(keyEvent({ key: "f", ctrlKey: true }), "/", null)).toBe(false);
  });
});
