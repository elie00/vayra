// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import fr from "@/lib/i18n/locales/fr";
import { Dots } from "@/components/onboarding/dots";
import { ColorPicker } from "./color-picker";
import { ProfilesStrip } from "./account/profiles-strip";

// French, as the scenario that found these read them.
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string, vars?: Record<string, string | number>) => {
  let v = fr[key] ?? key;
  for (const [n, r] of Object.entries(vars ?? {})) v = v.replaceAll(`{${n}}`, String(r));
  return v;
} }));
const profiles = vi.hoisted(() => ({
  profiles: [
    { id: "a", name: "Guest 1884", avatar: null, color: "#7dd3fc", isPrimary: true, passwordHash: null },
    { id: "b", name: "Léa", avatar: null, color: "#f472b6", isPrimary: false, passwordHash: null },
  ],
  activeProfile: { id: "a" },
  openPicker: vi.fn(),
  selectProfile: vi.fn(),
}));
vi.mock("@/lib/profiles", () => ({ useProfiles: () => profiles }));

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(node: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, root };
}
const labels = (host: HTMLElement) => [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));

it("names the setup steps in the interface language", () => {
  const { host, root } = mount(<Dots count={3} active={1} onJump={() => {}} />);
  expect(labels(host)).toEqual(["Étape 1", "Étape 2", "Étape 3"]);
  expect(host.querySelectorAll("[aria-current='step']")).toHaveLength(1);
  act(() => root.unmount());
});

it("names each colour swatch by its colour, and says which one is chosen", () => {
  const { host, root } = mount(<ColorPicker value="#f472b6" onChange={() => {}} />);
  const swatches = [...host.querySelectorAll("button[aria-pressed]")];
  expect(swatches.map((b) => b.getAttribute("aria-label"))).toEqual([
    "Bleu ciel", "Bleu", "Violet", "Rose", "Corail", "Indigo", "Azur", "Citron vert", "Émeraude", "Cyan",
  ]);
  expect(swatches.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label"))).toEqual(["Rose"]);
  act(() => root.unmount());
});

it("offers one Edit for the active profile, and Switch plus Edit for the others", () => {
  const { host, root } = mount(<ProfilesStrip />);
  const all = labels(host);
  expect(all.filter((l) => l === "Modifier Guest 1884")).toHaveLength(1);
  expect(all).toContain("Passer à Léa");
  expect(all).toContain("Modifier Léa");
  act(() => root.unmount());
});
