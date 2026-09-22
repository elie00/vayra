// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadButton } from "./download-button";
import { playbackSourceStatus } from "./playback-source-status";
import { renderCustomIconControl, renderCustomIconControlStremio } from "./custom-icon-renderer";
import type { ControlContext } from "./control-renderer";
import type { StremioRenderCtx } from "./control-renderer-stremio";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, t: (key: string) => key }));
vi.mock("./tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./big-button", () => ({ BigButton: ({ children, ariaLabel, onClick }: { children: React.ReactNode; ariaLabel: string; onClick?: () => void }) => <button aria-label={ariaLabel} onClick={onClick}>{children}</button> }));
vi.mock("./stremio-btn", () => ({ StremioBtn: ({ children, ariaLabel, onClick }: { children: React.ReactNode; ariaLabel: string; onClick?: () => void }) => <button aria-label={ariaLabel} onClick={onClick}>{children}</button> }));

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const queued = { kind: "queued" as const, ratio: 0, receivedBytes: 0, totalBytes: null };

it("pauses a queued transfer instead of creating another copy", async () => {
  const host = document.createElement("div"); const root = createRoot(host);
  const actions = { onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn(), onReveal: vi.fn(), onReset: vi.fn() };
  try {
    await act(async () => root.render(<DownloadButton status={queued} {...actions} />));
    expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Pause download");
    await act(async () => host.querySelector("button")!.click());
    expect(actions.onPause).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(playbackSourceStatus({ buffering: false }, queued)?.label).toBe("Queued");
  } finally { await act(async () => root.unmount()); }
});

it("keeps a completed file available after the former twelve-second timeout", async () => {
  const host = document.createElement("div"); const root = createRoot(host);
  const actions = { onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn(), onReveal: vi.fn(), onReset: vi.fn() };
  try {
    await act(async () => root.render(<DownloadButton status={{ kind: "done", path: "/Downloads/film.mkv" }} {...actions} />));
    await act(async () => vi.advanceTimersByTimeAsync(13000));
    expect(actions.onReset).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(actions.onReveal).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});

it("preserves queued pause with custom icons in both player layouts", async () => {
  const host = document.createElement("div"); const root = createRoot(host);
  const onDownloadPause = vi.fn(); const onDownloadStart = vi.fn();
  const ctx = { download: queued, onDownloadPause, onDownloadStart, t: (key: string) => key };
  try {
    await act(async () => root.render(<>
      {renderCustomIconControl("download", ctx as unknown as ControlContext, "icon.svg")}
      {renderCustomIconControlStremio("download", ctx as unknown as StremioRenderCtx, "icon.svg")}
    </>));
    expect(host.querySelectorAll("button")).toHaveLength(2);
    await act(async () => host.querySelectorAll("button").forEach((button) => button.click()));
    expect(onDownloadPause).toHaveBeenCalledTimes(2);
    expect(onDownloadStart).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
