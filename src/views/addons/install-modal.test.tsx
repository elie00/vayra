// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddonInstallModal } from "./install-modal";
import type { InstallResult, StremioSyncStatus } from "@/lib/addon-store";

const mocks = vi.hoisted(() => ({ manifest: { id: "fixture", name: "Fixture addon", version: "1", types: [], resources: [] } }));
vi.mock("@/lib/addon-store", () => ({
  fetchManifestAt: async () => mocks.manifest,
  findHostnameMatch: () => null,
  isInstalled: () => false,
  manifestToConfigureUrl: (url: string) => url,
  parseAddonUrl: (url: string) => ({ kind: "manifest", url }),
}));
vi.mock("@/components/installer-viewport", () => ({ openInstallerViewport: vi.fn() }));
vi.mock("@/lib/platform", () => ({ isWeb: () => false }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

let host: HTMLDivElement; let root: Root;
const mode = { kind: "install" as const, url: "https://example.invalid/manifest.json" };
const installButton = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === "Install")!;
const result = (syncStatus: StremioSyncStatus): InstallResult => ({ addon: { manifest: mocks.manifest, transportUrl: mode.url }, replaced: false, syncStatus, syncedToStremio: syncStatus === "synced" });

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it.each([
  ["not-connected", "Stremio is not connected.", "status"],
  ["synced", "Synced to your Stremio account.", "status"],
  ["failed", "Stremio sync failed.", "alert"],
] as const)("reports %s without conflating local saving with synchronization", async (syncStatus, message, role) => {
  const install = vi.fn().mockResolvedValue(result(syncStatus));
  await act(async () => root.render(<AddonInstallModal mode={mode} onClose={vi.fn()} onInstall={install} />));
  await act(async () => installButton().click());
  expect(host.querySelector("h3")?.textContent).toBe("Installed locally");
  expect(host.querySelector(`[role="${role}"]`)?.textContent).toContain(message);
  expect(host.textContent).not.toContain("Syncing to Stremio");
});

it("does not check an unfinished step or allow Escape to hide a pending operation", async () => {
  let finish!: (value: InstallResult) => void;
  const install = vi.fn(() => new Promise<InstallResult>((resolve) => { finish = resolve; }));
  const close = vi.fn();
  await act(async () => root.render(<AddonInstallModal mode={mode} onClose={close} onInstall={install} />));
  await act(async () => installButton().click());
  expect(host.textContent).toContain("Saving addon");
  expect(host.textContent).not.toContain("Syncing to Stremio");
  expect(host.querySelector("h3")?.textContent).not.toBe("Installed locally");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish(result("not-connected")));
});

it("announces a local failure and retains the manifest for another attempt", async () => {
  const install = vi.fn().mockResolvedValue(null);
  await act(async () => root.render(<AddonInstallModal mode={mode} onClose={vi.fn()} onInstall={install} />));
  await act(async () => installButton().click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Install failed.");
  expect(installButton()).toBeTruthy();
  expect(host.querySelector("h3")?.textContent).not.toBe("Installed locally");
});
