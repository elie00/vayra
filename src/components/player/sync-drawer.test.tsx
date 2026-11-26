// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaraRemoteRoom } from "@/lib/vara/types";
import { SyncDrawer } from "./sync-drawer";
import { VaraStatusPill } from "./vara-status-pill";

const ROOM: VaraRemoteRoom = {
  id: "room-1",
  ownerId: "u1",
  hostId: "u1",
  topic: "vara:1234567890abcdef1234567890abcdef",
  hostEpoch: 1,
  hostLeaseUntil: "2026-11-26T18:00:00Z",
  maxMembers: 6,
  createdAt: "2026-11-26T17:00:00Z",
  expiresAt: "2026-11-26T20:00:00Z",
  members: [
    { userId: "u1", handle: "alice", displayName: "Alice", avatarKey: null, isHost: true, joinedAt: "2026-11-26T17:00:00Z" },
    { userId: "u2", handle: "bob", displayName: "Bob", avatarKey: null, isHost: false, joinedAt: "2026-11-26T17:01:00Z" },
  ],
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VaraStatusPill", () => {
  it("renders Sync · count with zero VEYA/VARA codenames and toggles the drawer", async () => {
    const onToggleDrawer = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VaraStatusPill
          syncActive
          isHost
          memberCount={2}
          drawerOpen={false}
          onToggleDrawer={onToggleDrawer}
        />,
      );
    });

    const pill = container.querySelector('[data-testid="vara-status-pill"]') as HTMLButtonElement;
    expect(pill).not.toBeNull();
    expect(pill.textContent).toContain("Sync · 2");
    expect(pill.textContent).not.toMatch(/\b(VEYA|VARA)\b/);
    expect(pill.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      pill.click();
    });
    expect(onToggleDrawer).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});

describe("SyncDrawer", () => {
  it("lists participants, handles actions, and dismisses on Escape without propagating", async () => {
    const onClose = vi.fn();
    const onCopyInviteLink = vi.fn().mockResolvedValue(true);
    const onClaimHost = vi.fn().mockResolvedValue(undefined);
    const onTransferHost = vi.fn().mockResolvedValue(undefined);
    const onForceResync = vi.fn();
    const onLeaveRoom = vi.fn();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SyncDrawer
          room={ROOM}
          currentUserId="u1"
          syncActive
          onClose={onClose}
          onCopyInviteLink={onCopyInviteLink}
          onClaimHost={onClaimHost}
          onTransferHost={onTransferHost}
          onForceResync={onForceResync}
          onLeaveRoom={onLeaveRoom}
        />,
      );
    });

    const drawer = container.querySelector('[data-testid="sync-drawer"]')!;
    expect(drawer.textContent).toContain("Alice");
    expect(drawer.textContent).toContain("Bob");
    expect(drawer.textContent).toContain("@bob");

    const buttons = [...drawer.querySelectorAll("button")];
    const transferBtn = buttons.find((b) => b.textContent?.includes("Transfer host"))!;
    const copyBtn = buttons.find((b) => b.textContent?.includes("Copy invite link"))!;
    const resyncBtn = buttons.find((b) => b.textContent?.includes("Force resync"))!;
    const leaveBtn = buttons.find((b) => b.textContent?.includes("Leave room"))!;

    await act(async () => {
      transferBtn.click();
    });
    expect(onTransferHost).toHaveBeenCalledWith("u2");

    await act(async () => {
      copyBtn.click();
    });
    expect(onCopyInviteLink).toHaveBeenCalledTimes(1);

    await act(async () => {
      resyncBtn.click();
    });
    expect(onForceResync).toHaveBeenCalledTimes(1);

    await act(async () => {
      leaveBtn.click();
    });
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);

    const bubbleSpy = vi.fn();
    window.addEventListener("keydown", bubbleSpy);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    });
    window.removeEventListener("keydown", bubbleSpy);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbleSpy).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });
});
