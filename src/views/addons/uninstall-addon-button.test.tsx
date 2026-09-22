// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UninstallAddonButton } from "./uninstall-addon-button";
import { InstalledPane } from "./installed-pane";
import { FeatureCard } from "./feature-card";
import type { ResolvedAddon } from "@/lib/addons-store/store";

const mocks = vi.hoisted(() => ({ authKey: null as string | null }));
vi.mock("@/lib/auth", () => ({ readActiveStremioAuthKey: () => mocks.authKey }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string, values?: Record<string, string>) => key.replace(/\{(\w+)\}/g, (_, id: string) => values?.[id] ?? id), t: (key: string) => key }));
vi.mock("@/lib/addon-store", () => ({ isAddonEnabled: () => true, manifestRequiresConfiguration: () => false, setAddonEnabled: vi.fn() }));
vi.mock("@/components/addon-logo", () => ({ AddonLogo: () => null, resolveAddonLogo: () => null }));
vi.mock("@/components/addon-star-badge", () => ({ AddonStarBadge: () => null }));
vi.mock("@/components/card-art-backdrop", () => ({ CardArtBackdrop: () => null }));
vi.mock("@/components/hover-tooltip", () => ({ HoverTooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./diagnostic-button", () => ({ AddonDiagnosticButton: () => null }));
vi.mock("./tag-row", () => ({ TagRow: () => null }));
vi.mock("@/lib/platform", () => ({ isMacDesktop: () => false }));

const fixture = { installed: true, transportUrl: "https://example.invalid/manifest.json", manifest: { id: "fixture", name: "Fixture addon", resources: [], types: [] } } as unknown as ResolvedAddon;
let host: HTMLDivElement;
let root: Root;
const action = () => document.querySelector<HTMLButtonElement>('button[aria-label="Uninstall Fixture addon"]')!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const button = (text: string) => [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;

beforeEach(() => {
  mocks.authKey = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) { return this.parentElement; });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps Installed non-destructive in the installed list and focuses Cancel first", async () => {
  const remove = vi.fn();
  await act(async () => root.render(<InstalledPane installed={[fixture]} onOpen={vi.fn()} onUninstall={remove} />));
  expect([...host.querySelectorAll("button")].some((node) => node.textContent === "Installed")).toBe(false);
  await act(async () => action().click());
  expect(dialog().textContent).toContain("this device only");
  expect(document.activeElement).toBe(button("Cancel"));
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(remove).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(action());
});

it("closes with Escape without invoking removal", async () => {
  const remove = vi.fn();
  await act(async () => root.render(<UninstallAddonButton name="Fixture addon" onUninstall={remove} />));
  await act(async () => action().click());
  await act(async () => button("Uninstall").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(remove).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(action());
});

it("explains linked account scope and only removes on explicit confirmation", async () => {
  mocks.authKey = "fixture-session";
  const remove = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<UninstallAddonButton name="Fixture addon" onUninstall={remove} />));
  await act(async () => action().click());
  expect(dialog().textContent).toContain("including its other devices");
  expect(dialog().textContent).toContain("downloaded files are kept");
  expect(remove).not.toHaveBeenCalled();
  await act(async () => button("Uninstall").click());
  expect(remove).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("blocks removal if the linked account changes after the scope was shown", async () => {
  const remove = vi.fn();
  await act(async () => root.render(<UninstallAddonButton name="Fixture addon" onUninstall={remove} />));
  await act(async () => action().click());
  mocks.authKey = "new-fixture-session";
  await act(async () => button("Uninstall").click());
  expect(remove).not.toHaveBeenCalled();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("connection changed");
});

it("preserves the dialog on failure and lets the user retry", async () => {
  const remove = vi.fn().mockRejectedValueOnce(new Error("private transport details")).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<UninstallAddonButton name="Fixture addon" onUninstall={remove} />));
  await act(async () => action().click());
  await act(async () => button("Uninstall").click());
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("try again");
  expect(dialog().textContent).not.toContain("private transport details");
  await act(async () => button("Uninstall").click());
  expect(remove).toHaveBeenCalledTimes(2);
});

it("does not navigate the parent card when using the portal or keyboard action", async () => {
  const open = vi.fn(); const remove = vi.fn();
  await act(async () => root.render(<FeatureCard resolved={fixture} installed onOpen={open} onInstall={vi.fn()} onUninstall={remove} />));
  await act(async () => action().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(open).not.toHaveBeenCalled();
  await act(async () => action().click());
  await act(async () => button("Cancel").click());
  expect(open).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it("returns focus to the installed pane when successful removal unmounts the trigger", async () => {
  function Harness() {
    const [items, setItems] = useState([fixture]);
    return <InstalledPane installed={items} onOpen={vi.fn()} onUninstall={async () => setItems([])} />;
  }
  await act(async () => root.render(<Harness />));
  await act(async () => action().click());
  await act(async () => button("Uninstall").click());
  expect(host.textContent).toContain("No addons installed yet");
  expect(document.activeElement).toBe(host.firstElementChild);
});

it("keeps the exact target shown at confirmation if the parent refreshes", async () => {
  const original = vi.fn(); const replacement = vi.fn();
  await act(async () => root.render(<UninstallAddonButton name="Fixture addon" onUninstall={original} />));
  await act(async () => action().click());
  await act(async () => root.render(<UninstallAddonButton name="Replacement addon" onUninstall={replacement} />));
  expect(dialog().querySelector("h2")?.textContent).toBe("Uninstall Fixture addon?");
  await act(async () => button("Uninstall").click());
  expect(original).toHaveBeenCalledOnce();
  expect(replacement).not.toHaveBeenCalled();
});
