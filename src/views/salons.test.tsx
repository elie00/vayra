// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SalonsView } from "./salons";

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  openMeta: vi.fn(),
  activateRoom: vi.fn().mockResolvedValue(undefined),
  leaveActiveRoom: vi.fn().mockResolvedValue(undefined),
  closeActiveRoom: vi.fn().mockResolvedValue(undefined),
  ciraStatus: "ready" as "ready" | "signedOut" | "restricted",
  ciraMe: {
    userId: "u-1",
    handle: "alice_01",
    displayName: "Alice",
    avatarKey: null,
    presenceOptIn: true,
    createdAt: "2026-11-26T00:00:00Z",
    updatedAt: "2026-11-26T00:00:00Z",
  } as Record<string, unknown> | null,
  activeRoom: null as Record<string, unknown> | null,
  varaRepo: {
    createRoom: vi.fn().mockResolvedValue({ id: "room-new", members: [] }),
    createLink: vi.fn().mockResolvedValue({ url: "https://vayra.app/r/abc" }),
    listGroupCollectionsPage: vi.fn().mockResolvedValue({
      items: [{ id: "col-1", name: "Sci-Fi", description: null }],
      hasMore: false,
    }),
    listCollectionItemsPage: vi.fn().mockResolvedValue({
      items: [
        {
          id: "item-1",
          metaId: "tt15239678",
          mediaType: "movie",
          title: "Dune: Part Two",
          posterUrl: "https://image.tmdb.org/t/p/w300/dune.jpg",
        },
      ],
      hasMore: false,
    }),
  },
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));

vi.mock("@/lib/platform", () => ({
  hasNativeDesktopUx: () => true,
}));

vi.mock("@/lib/view", () => ({
  useScrollMemory: () => undefined,
  useView: () => ({
    openSettings: mocks.openSettings,
    openMeta: mocks.openMeta,
    setView: vi.fn(),
  }),
}));

vi.mock("@/lib/cira/provider", () => ({
  useCira: () => ({
    status: mocks.ciraStatus,
    me: mocks.ciraMe,
    autoProvisioning: false,
    autoProvisionError: null,
    retryProvision: vi.fn(),
    inbox: { friendRequestCount: 0, groupInvitationCount: 0, unreadCount: 0 },
    relationships: [
      {
        id: "rel-1",
        status: "accepted",
        presence: "in_vara",
        profile: { userId: "u-2", handle: "bob_02", displayName: "Bob", avatarKey: null },
      },
    ],
    groups: [
      {
        id: "grp-1",
        name: "Ciné Club",
        description: "Vendredi soir",
        memberCount: 3,
        archivedAt: null,
      },
    ],
    groupInvitations: [],
    repo: {
      sendFriendRequest: vi.fn(),
      createInvitation: vi.fn(),
      createGroup: vi.fn(),
    },
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/vara/provider", () => ({
  useVara: () => ({
    status: "ready",
    activeRoom: mocks.activeRoom,
    rooms: [],
    invitations: [],
    activateRoom: mocks.activateRoom,
    leaveActiveRoom: mocks.leaveActiveRoom,
    closeActiveRoom: mocks.closeActiveRoom,
    refresh: vi.fn(),
    repo: mocks.varaRepo,
  }),
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<SalonsView active />);
  });
  return host;
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  mocks.ciraStatus = "ready";
  mocks.ciraMe = {
    userId: "u-1",
    handle: "alice_01",
    displayName: "Alice",
    avatarKey: null,
    presenceOptIn: true,
    createdAt: "2026-11-26T00:00:00Z",
    updatedAt: "2026-11-26T00:00:00Z",
  };
  mocks.activeRoom = null;
  mocks.openSettings.mockReset();
  mocks.openMeta.mockReset();
  vi.unstubAllGlobals();
});

describe("SalonsView", () => {
  it("shows signed-out card pointing to Account settings", () => {
    mocks.ciraStatus = "signedOut";
    mocks.ciraMe = null;
    const el = mount();
    expect(el.textContent).toContain("Sign in to your VAYRA account");
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Go to Account"));
    act(() => btn?.click());
    expect(mocks.openSettings).toHaveBeenCalledWith("account");
  });

  it("renders 3 tabs (Salons, Groups, Friends) with poster collections and live presence", async () => {
    const el = mount();
    expect(el.textContent).toContain("New room");
    expect(el.querySelectorAll('[role="tab"]').length).toBe(3);

    // Switch to Groups tab and verify poster tile opens detail page
    const groupsTab = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
      b.textContent?.includes("Groups"),
    );
    await act(async () => {
      groupsTab?.click();
      await Promise.resolve();
    });
    expect(el.textContent).toContain("Ciné Club");
    await vi.waitFor(() => {
      expect(el.textContent).toContain("Dune: Part Two");
    });
    const posterBtn = [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("Dune: Part Two"),
    );
    act(() => posterBtn?.click());
    expect(mocks.openMeta).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tt15239678", name: "Dune: Part Two" }),
    );

    // Switch to Friends tab and verify presence label
    const friendsTab = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
      b.textContent?.includes("Friends"),
    );
    act(() => friendsTab?.click());
    expect(el.textContent).toContain("Bob");
    expect(el.textContent).toContain("In a room");
  });
});
