// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import fr from "@/lib/i18n/locales/fr";
import { backupSafety } from "@/lib/i18n/locales/fr/backup-safety";
import { BackupRestoreError, type Backup } from "@/lib/backup";
import { BackupRow } from "./backup-row";

const state = vi.hoisted(() => ({ restore: vi.fn(), export: vi.fn(), parse: vi.fn(), readError: false }));
vi.mock("@/lib/backup", async (original) => ({ ...await original<object>(), applyBackup: state.restore, downloadBackup: state.export, parseBackup: state.parse }));
vi.mock("@/lib/i18n", () => ({ getUiLanguage: () => "fr", useT: () => (key: string, vars?: Record<string, string | number>) => {
  let result = backupSafety[key] ?? fr[key] ?? key;
  for (const [name, value] of Object.entries(vars ?? {})) result = result.replaceAll(`{${name}}`, String(value));
  return result;
} }));
const backup: Backup = { format: "vayra-backup", version: 2, app: "fixture", exportedAt: "2026-09-06T10:00:00Z", data: { "harbor.settings": "{}" } };
let root: Root;
let host: HTMLDivElement;
let scheduledReload: MockInstance<typeof window.setTimeout>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.restore.mockReset().mockResolvedValue(undefined);
  state.export.mockReset().mockResolvedValue(true);
  state.parse.mockReset().mockReturnValue({ ok: true, backup });
  state.readError = false;
  vi.stubGlobal("FileReader", class {
    result = "fixture only";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsText() { if (state.readError) this.onerror?.(); else this.onload?.(); }
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
  scheduledReload = vi.spyOn(window, "setTimeout").mockImplementation(() => 1 as unknown as ReturnType<typeof window.setTimeout>);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount() { await act(async () => root.render(<BackupRow />)); }
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((element) => element.textContent === label)!;
}
async function openRestore() {
  const restore = button(fr.Restore);
  restore.focus();
  const file = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(file, "files", { configurable: true, value: [new File(["fixture"], "fixture.vayrx")] });
  await act(async () => file.dispatchEvent(new Event("change", { bubbles: true })));
  return restore;
}
async function key(target: Element, value: string, shiftKey = false) {
  await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })));
}

it("names the confirmation, focuses Cancel, traps Tab and restores focus on Escape", async () => {
  await mount(); const trigger = await openRestore();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe(fr["Restore this backup?"]);
  const cancel = button(fr.Cancel, dialog); const confirm = button(fr["Restore and reload"], dialog);
  expect(document.activeElement).toBe(cancel);
  await key(cancel, "Tab", true); expect(document.activeElement).toBe(confirm);
  await key(confirm, "Tab"); expect(document.activeElement).toBe(cancel);
  await key(cancel, "Escape");
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(state.restore).not.toHaveBeenCalled();
});

it("retains the dialog with a French error and never schedules reload on failure", async () => {
  state.restore.mockRejectedValue(new BackupRestoreError("Restore failed. Your previous preferences were recovered. Free some space and retry, or choose another backup."));
  await mount(); await openRestore();
  await act(async () => button(fr["Restore and reload"]).click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("anciennes préférences ont été récupérées");
  expect(button(fr["Restore and reload"], dialog).disabled).toBe(false); expect(scheduledReload).not.toHaveBeenCalledWith(expect.any(Function), 280);
});

it("prevents duplicate restores and closing while an operation is pending", async () => {
  let finish!: () => void;
  state.restore.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  await mount(); await openRestore();
  const confirm = button(fr["Restore and reload"]);
  await act(async () => { confirm.click(); confirm.click(); });
  expect(state.restore).toHaveBeenCalledOnce();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).toBe(dialog);
  await key(dialog, "Escape"); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(scheduledReload).not.toHaveBeenCalledWith(expect.any(Function), 280);
  await act(async () => finish());
  expect(scheduledReload).toHaveBeenCalledWith(expect.any(Function), 280);
});

it("offers retry recovery, including after closing the confirmation, without losing the snapshot", async () => {
  const retry = vi.fn().mockResolvedValue(undefined);
  state.restore.mockRejectedValue(new BackupRestoreError("Recovery is incomplete. Keep VAYRA open and retry recovery.", retry));
  await mount(); await openRestore();
  await act(async () => button(fr["Restore and reload"]).click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(button(backupSafety["Retry recovery"], dialog)).toBeTruthy();
  await key(dialog, "Escape");
  expect(button(fr.Export).disabled).toBe(true);
  await act(async () => button(backupSafety["Retry recovery"]).click());
  expect(retry).toHaveBeenCalledOnce(); expect(button(fr.Export).disabled).toBe(false);
  expect(document.body.textContent).toContain("anciennes préférences ont été récupérées"); expect(scheduledReload).not.toHaveBeenCalledWith(expect.any(Function), 280);
});

it("makes private activity opt-in and describes excluded data before exporting", async () => {
  await mount();
  expect(document.body.textContent).toContain("comptes, clés, profils, extensions configurées");
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(checkbox.checked).toBe(false);
  await act(async () => button(fr.Export).click());
  expect(state.export).toHaveBeenLastCalledWith({ includeLocalActivity: false });
  // A fresh mount avoids the short-lived Saved label while testing the opt-in.
  await act(async () => root.render(<BackupRow key="with-activity" />));
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button(fr.Export).click());
  expect(state.export).toHaveBeenLastCalledWith({ includeLocalActivity: true });
});

it("localizes invalid-file and read errors and never opens a destructive confirmation", async () => {
  state.parse.mockReturnValue({ ok: false, error: "That file is not valid JSON." });
  await mount(); await openRestore();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(backupSafety["That file is not valid JSON."]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  state.readError = true; await openRestore();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(backupSafety["Could not read that file."]);
  expect(state.restore).not.toHaveBeenCalled();
});
