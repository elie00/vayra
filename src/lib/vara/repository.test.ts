import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VaraError } from "./errors";
import {
  createVaraRepository,
  normalizeVaraInviteCode,
  requireValidVaraInviteCode,
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
