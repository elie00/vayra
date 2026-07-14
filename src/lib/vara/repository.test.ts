import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VaraError } from "./errors";
import {
  createVaraRepository,
  normalizeVaraInviteCode,
  requireValidCollectionItem,
  requireValidVaraInviteCode,
  toCollection,
  toCollectionItem,
  toVaraRoom,
} from "./repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";

const ROOM_ROW = {
  room_id: ROOM_ID,
  owner_id: USER_ID,
  host_id: USER_ID,
  topic: "vara:1234567890abcdef1234567890abcdef",
  host_epoch: 3,
  host_lease_until: "2026-07-13T22:30:00Z",
  max_members: 8,
  created_at: "2026-07-13T22:00:00Z",
  expires_at: "2026-07-14T02:00:00Z",
  members: [
    {
      user_id: USER_ID,
      handle: "elie",
      display_name: "Élie",
      avatar_key: null,
      is_host: true,
      joined_at: "2026-07-13T22:00:00Z",
    },
  ],
};

const COLLECTION_ROW = {
  collection_id: "col-1",
  group_id: "group-1",
  name: "Watch order",
  description: "Club nights",
  member_policy: "collaborator",
  members_can_edit: true,
  is_delegate: false,
  can_edit_all: true,
  item_count: 4,
  created_by: {
    user_id: USER_ID,
    handle: "elie",
    display_name: "Élie",
    avatar_key: null,
  },
  updated_by: null,
  my_role: "owner",
  can_manage: true,
  can_edit_items: true,
  created_at: "2026-07-14T10:00:00Z",
  updated_at: "2026-07-14T10:05:00Z",
};

const ITEM_ROW = {
  item_id: "item-1",
  collection_id: "col-1",
  meta_id: "kitsu:44042",
  media_type: "anime",
  season: 1,
  episode: 5,
  title: "Episode 5",
  poster_url: "https://images.metahub.space/poster/small/tt1/img",
  position: 2,
  added_by: null,
  added_at: "2026-07-14T10:04:00Z",
};

function makeClient(session = true) {
  const rpc = vi.fn().mockResolvedValue({ data: { status: "ok" }, error: null });
  const getSession = vi.fn().mockResolvedValue({
    data: { session: session ? { user: { id: USER_ID } } : null },
    error: null,
  });
  const client = { auth: { getSession }, rpc } as unknown as SupabaseClient;
  return { client, rpc, getSession };
}

describe("VARA invite code", () => {
  it("normalizes separators and case", () => {
    expect(normalizeVaraInviteCode("vara-0123-4567-89ab-cdef-ghjk")).toBe(
      "VARA0123456789ABCDEFGHJK",
    );
  });

  it("accepts only the 100-bit Crockford token shape", () => {
    const code = "VARA0123456789ABCDEFGHJK";
    expect(requireValidVaraInviteCode(code)).toBe(code);
    expect(() => requireValidVaraInviteCode("VARA-invalid-token")).toThrowError(
      new VaraError("VARA_INVITE_UNAVAILABLE"),
    );
  });
});

describe("VARA room decoder", () => {
  it("maps a strict server room without persisting media data", () => {
    expect(toVaraRoom(ROOM_ROW)).toMatchObject({
      id: ROOM_ID,
      ownerId: USER_ID,
      topic: ROOM_ROW.topic,
      hostEpoch: 3,
      members: [{ handle: "elie", isHost: true }],
    });
  });

  it("rejects a non-opaque topic", () => {
    expect(() => toVaraRoom({ ...ROOM_ROW, topic: "vara-demo" })).toThrowError(
      new VaraError("UNKNOWN"),
    );
  });
});

describe("VARA collection decoders", () => {
  it("maps a collection and masks a null author", () => {
    expect(toCollection(COLLECTION_ROW)).toMatchObject({
      id: "col-1",
      groupId: "group-1",
      membersCanEdit: true,
      itemCount: 4,
      createdBy: { handle: "elie" },
      updatedBy: null,
      myRole: "owner",
      canManage: true,
      canEditItems: true,
    });
  });

  it("maps an item without any playback or source field", () => {
    const item = toCollectionItem(ITEM_ROW);
    expect(item).toMatchObject({
      id: "item-1",
      metaId: "kitsu:44042",
      mediaType: "anime",
      season: 1,
      episode: 5,
      position: 2,
      addedBy: null,
    });
    expect(Object.keys(item)).not.toContain("stream");
    expect(Object.keys(item)).not.toContain("source");
  });
});

describe("requireValidCollectionItem", () => {
  const base = { metaId: "tt0111161", mediaType: "movie", title: "Film" } as const;

  it("accepts a public reference and trims the title", () => {
    expect(requireValidCollectionItem({ ...base, title: "  Film  " })).toEqual({
      metaId: "tt0111161",
      mediaType: "movie",
      title: "Film",
      season: null,
      episode: null,
      posterUrl: null,
    });
  });

  it("keeps a valid https poster on a dotted host", () => {
    const poster = "https://images.metahub.space/poster/small/tt0111161/img";
    expect(requireValidCollectionItem({ ...base, posterUrl: poster }).posterUrl).toBe(poster);
  });

  it("drops season/episode on a non-episodic type", () => {
    const result = requireValidCollectionItem({ ...base, season: 1, episode: 2 });
    expect(result.season).toBeNull();
    expect(result.episode).toBeNull();
  });

  it("keeps season/episode on series and anime", () => {
    expect(requireValidCollectionItem({
      metaId: "kitsu:1", mediaType: "anime", title: "Ep", season: 1, episode: 5,
    })).toMatchObject({ season: 1, episode: 5 });
  });

  it.each([
    ["a meta id with a slash", { ...base, metaId: "tt1/evil" }],
    ["an http image", { ...base, posterUrl: "http://img.example.com/p.jpg" }],
    ["an ip-literal image host", { ...base, posterUrl: "https://192.168.1.5/p.jpg" }],
    ["a hex ip-literal host", { ...base, posterUrl: "https://0x7f.0.0.1/p.jpg" }],
    ["a numeric-tld host", { ...base, posterUrl: "https://example.123/p.jpg" }],
    ["a single-label host", { ...base, posterUrl: "https://localhost/p.jpg" }],
    ["a userinfo image url", { ...base, posterUrl: "https://a@img.example.com/p.jpg" }],
    ["a bracketed title", { ...base, title: "XSS <img>" }],
    ["a non-https scheme", { ...base, posterUrl: "javascript:alert(1)" }],
  ])("rejects %s", (_label, input) => {
    expect(() => requireValidCollectionItem(input)).toThrowError(
      new VaraError("INVALID_COLLECTION_ITEM"),
    );
  });
});

describe("createVaraRepository RPC wiring", () => {
  const cases: Array<{
    name: string;
    call: (repo: ReturnType<typeof createVaraRepository>) => Promise<unknown>;
    fn: string;
    args: Record<string, unknown> | undefined;
    data?: unknown;
  }> = [
    {
      name: "createRoom",
      call: (repo) => repo.createRoom(3600, 6),
      fn: "vara_create_room",
      args: { p_ttl_seconds: 3600, p_max_members: 6 },
      data: ROOM_ROW,
    },
    {
      name: "createRoom with group context",
      call: (repo) => repo.createRoom(3600, 6, "group-1"),
      fn: "vara_create_room",
      args: { p_ttl_seconds: 3600, p_max_members: 6, p_group_id: "group-1" },
      data: ROOM_ROW,
    },
    {
      name: "getRoom",
      call: (repo) => repo.getRoom(ROOM_ID),
      fn: "vara_get_room",
      args: { p_room_id: ROOM_ID },
      data: ROOM_ROW,
    },
    {
      name: "listRooms",
      call: (repo) => repo.listRooms(),
      fn: "vara_list_rooms",
      args: undefined,
      data: [ROOM_ROW],
    },
    {
      name: "renewHostLease",
      call: (repo) => repo.renewHostLease(ROOM_ID),
      fn: "vara_renew_host_lease",
      args: { p_room_id: ROOM_ID },
      data: { host_lease_until: ROOM_ROW.host_lease_until },
    },
    {
      name: "transferHost",
      call: (repo) => repo.transferHost(ROOM_ID, "user-2"),
      fn: "vara_transfer_host",
      args: { p_room_id: ROOM_ID, p_user_id: "user-2" },
      data: ROOM_ROW,
    },
    {
      name: "inviteMember",
      call: (repo) => repo.inviteMember(ROOM_ID, "user-2"),
      fn: "vara_invite_member",
      args: { p_room_id: ROOM_ID, p_user_id: "user-2" },
      data: { invitation_id: "invite-1" },
    },
    {
      name: "acceptInvitation",
      call: (repo) => repo.acceptInvitation("invite-1"),
      fn: "vara_accept_room_invite",
      args: { p_invitation_id: "invite-1" },
      data: ROOM_ROW,
    },
    {
      name: "previewLink",
      call: (repo) => repo.previewLink("VARA0123456789ABCDEFGHJK"),
      fn: "vara_preview_room_link",
      args: { p_code: "VARA0123456789ABCDEFGHJK" },
      data: {
        room_id: ROOM_ID,
        creator_handle: "elie",
        creator_display_name: "Élie",
        member_count: 2,
        expires_at: ROOM_ROW.expires_at,
      },
    },
    {
      name: "acceptLink",
      call: (repo) => repo.acceptLink("VARA0123456789ABCDEFGHJK"),
      fn: "vara_accept_room_link",
      args: { p_code: "VARA0123456789ABCDEFGHJK" },
      data: ROOM_ROW,
    },
    {
      name: "closeRoom",
      call: (repo) => repo.closeRoom(ROOM_ID),
      fn: "vara_close_room",
      args: { p_room_id: ROOM_ID },
    },
    {
      name: "listGroupCollectionsPage",
      call: (repo) => repo.listGroupCollectionsPage("group-1", 10, 25),
      fn: "vara_list_group_collections_page",
      args: { p_group_id: "group-1", p_limit: 25, p_offset: 10 },
      data: { items: [], has_more: false },
    },
    {
      name: "createCollection",
      call: (repo) => repo.createCollection("group-1", {
        name: "Watch order",
        description: null,
        membersCanEdit: true,
      }),
      fn: "vara_create_collection",
      args: {
        p_group_id: "group-1",
        p_name: "Watch order",
        p_description: null,
        p_members_can_edit: true,
      },
      data: COLLECTION_ROW,
    },
    {
      name: "moveCollectionItem",
      call: (repo) => repo.moveCollectionItem("item-1", 3),
      fn: "vara_move_collection_item",
      args: { p_item_id: "item-1", p_position: 3 },
      data: ITEM_ROW,
    },
    {
      name: "setCollectionPolicy",
      call: (repo) => repo.setCollectionPolicy("col-1", "contributor"),
      fn: "vara_set_collection_policy",
      args: { p_collection_id: "col-1", p_member_policy: "contributor" },
      data: { ...COLLECTION_ROW, member_policy: "contributor" },
    },
    {
      name: "addCollectionDelegate",
      call: (repo) => repo.addCollectionDelegate("col-1", "u2"),
      fn: "vara_add_collection_delegate",
      args: { p_collection_id: "col-1", p_user_id: "u2" },
    },
    {
      name: "removeCollectionDelegate",
      call: (repo) => repo.removeCollectionDelegate("col-1", "u2"),
      fn: "vara_remove_collection_delegate",
      args: { p_collection_id: "col-1", p_user_id: "u2" },
    },
    {
      name: "listCollectionDelegates",
      call: (repo) => repo.listCollectionDelegates("col-1"),
      fn: "vara_list_collection_delegates",
      args: { p_collection_id: "col-1" },
      data: [{ user_id: "u2", handle: "bob", display_name: "Bob", avatar_key: null }],
    },
    {
      name: "addCollectionItem",
      call: (repo) => repo.addCollectionItem("col-1", {
        metaId: "tt0111161",
        mediaType: "movie",
        title: "The Film",
      }),
      fn: "vara_add_collection_item",
      args: {
        p_collection_id: "col-1",
        p_meta_id: "tt0111161",
        p_media_type: "movie",
        p_title: "The Film",
        p_season: null,
        p_episode: null,
        p_poster_url: null,
      },
      data: ITEM_ROW,
    },
    {
      name: "removeCollectionItem",
      call: (repo) => repo.removeCollectionItem("item-1"),
      fn: "vara_remove_collection_item",
      args: { p_item_id: "item-1" },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const { client, rpc } = makeClient();
      rpc.mockResolvedValueOnce({ data: testCase.data ?? { status: "ok" }, error: null });
      await testCase.call(createVaraRepository(client));
      expect(rpc).toHaveBeenCalledWith(testCase.fn, testCase.args);
    });
  }

  it("never calls PostgREST without an authenticated account", async () => {
    const { client, rpc } = makeClient(false);
    await expect(createVaraRepository(client).listRooms()).rejects.toEqual(
      new VaraError("NOT_AUTHENTICATED"),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps generic server invite failures without echoing a token", async () => {
    const { client, rpc } = makeClient();
    rpc.mockResolvedValueOnce({
      data: { error: "VARA_INVITE_UNAVAILABLE" },
      error: null,
    });
    const secret = "VARA0123456789ABCDEFGHJK";
    const error = await createVaraRepository(client).previewLink(secret).catch((cause) => cause);
    expect(error).toEqual(new VaraError("VARA_INVITE_UNAVAILABLE"));
    expect(String(error)).not.toContain(secret);
  });
});
