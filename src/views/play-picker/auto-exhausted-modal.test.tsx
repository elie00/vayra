// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { AutoExhaustedModal } from "./auto-exhausted-modal";

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));
vi.mock("@/lib/view", () => ({ useView: () => ({ goBack: vi.fn() }) }));
vi.mock("@/lib/window", () => ({ openUrl: vi.fn() }));
vi.mock("@/lib/use-focus-trap", () => ({ useFocusTrap: () => undefined }));

afterEach(() => vi.unstubAllGlobals());

function render(triedCount: number, otherLanguageCount: number): string {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => {
    root.render(
      <AutoExhaustedModal
        meta={{ id: "tt1", type: "series", name: "Hijack" } as Meta}
        triedCount={triedCount}
        otherLanguageCount={otherLanguageCount}
        onBrowseManually={() => undefined}
      />,
    );
  });
  const text = host.textContent ?? "";
  act(() => root.unmount());
  return text;
}

it("says the sources exist only in other languages instead of blaming debrid or addons", () => {
  const text = render(0, 3);
  expect(text).toContain("No source in your audio language");
  expect(text).toContain("3 sources are available in other languages");
  expect(text).not.toContain("debrid key");
});

it("uses the singular for a single source", () => {
  expect(render(0, 1)).toContain("1 source is available in another language");
});

it("keeps the general explanation when sources were tried and failed", () => {
  const text = render(2, 3);
  expect(text).toContain("We could not find a working stream");
});
