// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaraRemoteRoom, VaraRoomInvitation } from "@/lib/vara/types";

const mockState = vi.hoisted(() => ({
  activeRoom: null as VaraRemoteRoom | null,
  invitations: [] as VaraRoomInvitation[],
  setView: vi.fn(),
}));

vi.mock("@/lib/vara/provider", () => ({
  useVara: () => ({
    activeRoom: mockState.activeRoom,
    invitations: mockState.invitations,
  }),
}));

vi.mock("@/lib/view", () => ({
  useView: () => ({
    setView: mockState.setView,
  }),
}));

import { ActiveRoomBanner } from "./active-room-banner";

const SAMPLE_ROOM: VaraRemoteRoom = {
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
  mockState.activeRoom = null;
  mockState.invitations = [];
  mockState.setView.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ActiveRoomBanner", () => {
  it("renders null when there is no active room and no pending invitations", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ActiveRoomBanner />));
    expect(container.innerHTML).toBe("");
    await act(async () => root.unmount());
  });

  it("renders active room banner and navigates to salons on click", async () => {
    mockState.activeRoom = SAMPLE_ROOM;
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ActiveRoomBanner />));

    const banner = container.querySelector('[data-testid="active-room-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Active room · 2 participants");

    const btn = banner!.querySelector("button")!;
    await act(async () => btn.click());
    expect(mockState.setView).toHaveBeenCalledWith("salons");
    await act(async () => root.unmount());
  });

  it("renders pending invitation banner when no room is active", async () => {
    mockState.invitations = [
      {
        id: "inv-1",
        roomId: "room-2",
        direction: "incoming",
        inviter: { userId: "u2", handle: "bob", displayName: "Bob" },
        invitee: { userId: "u1", handle: "alice", displayName: "Alice" },
        memberCount: 1,
        createdAt: "2026-11-26T17:00:00Z",
        expiresAt: "2026-11-26T18:00:00Z",
      },
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ActiveRoomBanner />));

    const banner = container.querySelector('[data-testid="active-room-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Room invitation");
    expect(banner!.textContent).toContain("Bob");

    const btn = banner!.querySelector("button")!;
    await act(async () => btn.click());
    expect(mockState.setView).toHaveBeenCalledWith("salons");
    await act(async () => root.unmount());
  });
});
