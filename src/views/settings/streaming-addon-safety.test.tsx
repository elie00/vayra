// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ManualAddonCard, RecommendedAddonCard } from "./streaming-panel";
import type { Settings } from "@/lib/settings";

const mocks = vi.hoisted(() => ({ uninstall: vi.fn(), install: vi.fn(), installed: true }));
vi.mock("@/lib/addon-store", () => ({
  uninstallAddon: mocks.uninstall,
  installAddon: mocks.install,
  isInstalled: () => mocks.installed,
  transportUrlFor: (id: string) => id === "fixture.real-id" ? "https://example.invalid/manifest.json" : null,
  cometKeyFromUrl: () => null,
}));
vi.mock("@/lib/auth", () => ({ readActiveStremioAuthKey: () => null }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string, vars?: Record<string, string>) => key.replace(/\{(\w+)\}/g, (_, key: string) => vars?.[key] ?? key), useUiLanguage: () => "en", t: (key: string) => key }));
vi.mock("@/lib/settings", () => ({ useSettings: vi.fn() }));
vi.mock("@/components/addon-logo", () => ({ AddonLogo: () => null }));
vi.mock("@/components/flag", () => ({ Flag: () => null }));
vi.mock("@/components/service-logo", () => ({ ServiceLogo: () => null }));
vi.mock("@/lib/window", () => ({ openUrl: vi.fn() }));

let host: HTMLDivElement; let root: Root;
const requestRemoval = () => document.querySelector<HTMLButtonElement>('button[aria-label="Uninstall Fixture addon"]')!;
const confirm = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "Uninstall")!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.installed = true;
  mocks.uninstall.mockReset().mockImplementation(async () => { mocks.installed = false; });
  mocks.install.mockReset().mockResolvedValue({ manifest: { id: "fixture.real-id" } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("requires confirmation before a recommended addon removes its exact installed transport", async () => {
  await act(async () => root.render(<RecommendedAddonCard id="fixture.real-id" title="Fixture addon" blurb="Fixture" urlBuilder={() => "https://example.invalid/manifest.json"} settings={{} as Settings} />));
  await act(async () => requestRemoval().click());
  expect(mocks.uninstall).not.toHaveBeenCalled();
  await act(async () => confirm().click());
  expect(mocks.uninstall).toHaveBeenCalledWith("fixture.real-id", "https://example.invalid/manifest.json");
  expect(requestRemoval()).toBeNull();
});

it("removes a manually installed manifest id, not its temporary local alias", async () => {
  await act(async () => root.render(<ManualAddonCard title="Fixture addon" blurb="Fixture" configureUrl="https://example.invalid/configure" />));
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://example.invalid/manifest.json");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Install")!.click());
  expect(requestRemoval()).toBeTruthy();
  await act(async () => requestRemoval().click());
  expect(mocks.uninstall).not.toHaveBeenCalled();
  await act(async () => confirm().click());
  expect(mocks.uninstall).toHaveBeenCalledWith("fixture.real-id", "https://example.invalid/manifest.json");
  expect(requestRemoval()).toBeNull();
});
