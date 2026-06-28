import { describe, expect, it } from "vitest";
import { effectiveBinding, eventToBinding, isTypingTarget } from "./hotkeys";

function key(p: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...p,
  } as unknown as KeyboardEvent;
}

// Élément factice (toujours non-null pour ne pas toucher `document` en env node).
function target(tagName: string, extra: Record<string, unknown> = {}): KeyboardEvent {
  return {
    target: {
      nodeType: 1,
      tagName,
      isContentEditable: false,
      getAttribute: () => null,
      ...extra,
    },
  } as unknown as KeyboardEvent;
}

describe("eventToBinding", () => {
  it("encode les modificateurs dans l'ordre ctrl/shift/alt/meta", () => {
    expect(eventToBinding(key({ key: "k", ctrlKey: true }))).toBe("ctrl+k");
    expect(eventToBinding(key({ key: "k", metaKey: true }))).toBe("meta+k");
    expect(eventToBinding(key({ key: "1", ctrlKey: true }))).toBe("ctrl+1");
  });

  it("ignore Shift sur une lettre et la met en minuscule", () => {
    expect(eventToBinding(key({ key: "K", shiftKey: true }))).toBe("k");
    expect(eventToBinding(key({ key: "F", ctrlKey: true, shiftKey: true }))).toBe("ctrl+f");
  });

  it("garde Shift sur une non-lettre", () => {
    expect(eventToBinding(key({ key: ">", shiftKey: true }))).toBe("shift+>");
  });

  it("normalise l'espace et laisse les touches nommées", () => {
    expect(eventToBinding(key({ key: " " }))).toBe("Space");
    expect(eventToBinding(key({ key: "/" }))).toBe("/");
    expect(eventToBinding(key({ key: "ArrowLeft" }))).toBe("ArrowLeft");
  });
});

describe("isTypingTarget", () => {
  it("est vrai dans les champs de saisie", () => {
    expect(isTypingTarget(target("INPUT"))).toBe(true);
    expect(isTypingTarget(target("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(target("SELECT"))).toBe(true);
    expect(isTypingTarget(target("DIV", { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(target("DIV", { getAttribute: (k: string) => (k === "role" ? "textbox" : null) }))).toBe(true);
  });

  it("est faux sur un élément ordinaire", () => {
    expect(isTypingTarget(target("DIV"))).toBe(false);
    expect(isTypingTarget(target("BUTTON"))).toBe(false);
  });
});

describe("effectiveBinding", () => {
  it("renvoie le binding par défaut sans override", () => {
    expect(effectiveBinding("globalSearchFocus", {})).toBe("/");
    expect(effectiveBinding("playerFullscreen", {})).toBe("f");
  });

  it("préfère l'override quand présent", () => {
    expect(effectiveBinding("globalSearchFocus", { globalSearchFocus: "k" })).toBe("k");
  });
});
