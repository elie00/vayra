import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCiraRepository,
  normalizeInviteCode,
  requireValidGroupInviteCode,
  requireValidInviteCode,
} from "./repository";
import type { CiraErrorCode } from "./types";

const USER_ID = "00000000-0000-4000-8000-000000000001";

type MockClient = {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
  channelOn: ReturnType<typeof vi.fn>;
  channelSubscribe: ReturnType<typeof vi.fn>;
  broadcastHandlers: Map<string, () => void>;
};

function makeClient({ session = true }: { session?: boolean } = {}): MockClient {
  const rpc = vi.fn().mockResolvedValue({ data: { status: "ok" }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const broadcastHandlers = new Map<string, () => void>();
  const channelObject = {
    on: vi.fn((_type: string, filter: { event: string }, callback: () => void) => {
      broadcastHandlers.set(filter.event, callback);
      return channelObject;
    }),
    subscribe: vi.fn(() => channelObject),
  };
  const channel = vi.fn().mockReturnValue(channelObject);
  const removeChannel = vi.fn().mockResolvedValue("ok");
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: session ? { user: { id: USER_ID } } : null },
        error: null,
      }),
    },
    rpc,
    from,
    channel,
    removeChannel,
  };
  return {
    client: client as unknown as SupabaseClient,
    rpc,
    from,
    maybeSingle,
    select,
    eq,
    channel,
    removeChannel,
    channelOn: channelObject.on,
    channelSubscribe: channelObject.subscribe,
    broadcastHandlers,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const PROFILE_ROW = {
  user_id: USER_ID,
  handle: "elie",
  display_name: "Élie",
  avatar_key: "fox-01",
  presence_opt_in: true,
  updated_at: "2026-07-13T12:00:00Z",
};

const INVITE_ROW = {
  invitation_id: "11111111-1111-4111-8111-111111111111",
  code: "CIRA-AB12-CD34-EF56-GH78-JK90",
  expires_at: "2026-07-13T12:15:00Z",
};

const GROUP_ROW = {
  group_id: "22222222-2222-4222-8222-222222222222",
  name: "Night crew",
  description: "Private circle",
  avatar_key: null,
  max_members: 100,
  member_count: 3,
  role: "owner",
  created_at: "2026-07-13T12:00:00Z",
  updated_at: "2026-07-13T12:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

describe("createCiraRepository RPC wiring", () => {
  const cases: Array<{
    name: string;
    call: (repo: ReturnType<typeof createCiraRepository>) => Promise<unknown>;
    rpcName: string;
    rpcArgs: Record<string, unknown> | undefined;
    rpcData?: unknown;
  }> = [
    {
      name: "saveProfile -> cira_upsert_profile",
      call: (repo) => repo.saveProfile({ handle: "elie", displayName: "Élie", avatarKey: "fox-01" }),
      rpcName: "cira_upsert_profile",
      rpcArgs: { p_handle: "elie", p_display_name: "Élie", p_avatar_key: "fox-01" },
      rpcData: PROFILE_ROW,
    },
    {
      name: "listRelationships -> cira_list_relationships",
      call: (repo) => repo.listRelationships(),
      rpcName: "cira_list_relationships",
      rpcArgs: undefined,
      rpcData: [],
    },
    {
      name: "listInvitations -> cira_list_invitations",
      call: (repo) => repo.listInvitations(),
      rpcName: "cira_list_invitations",
      rpcArgs: undefined,
      rpcData: [],
    },
    {
      name: "sendRequest -> cira_send_request",
      call: (repo) => repo.sendRequest("marie"),
      rpcName: "cira_send_request",
      rpcArgs: { p_handle: "marie" },
    },
    {
      name: "acceptRequest -> cira_accept_request",
      call: (repo) => repo.acceptRequest("req-1"),
      rpcName: "cira_accept_request",
      rpcArgs: { p_request_id: "req-1" },
    },
    {
      name: "declineRequest -> cira_decline_request",
      call: (repo) => repo.declineRequest("req-2"),
      rpcName: "cira_decline_request",
      rpcArgs: { p_request_id: "req-2" },
    },
    {
      name: "cancelRequest -> cira_cancel_request",
      call: (repo) => repo.cancelRequest("req-3"),
      rpcName: "cira_cancel_request",
      rpcArgs: { p_request_id: "req-3" },
    },
    {
      name: "removeFriend -> cira_remove_friend (p_user_id)",
      call: (repo) => repo.removeFriend("friend-user-1"),
      rpcName: "cira_remove_friend",
      rpcArgs: { p_user_id: "friend-user-1" },
    },
    {
      name: "blockUser -> cira_block_user",
      call: (repo) => repo.blockUser("user-x"),
      rpcName: "cira_block_user",
      rpcArgs: { p_user_id: "user-x" },
    },
    {
      name: "unblockUser -> cira_unblock_user",
      call: (repo) => repo.unblockUser("user-x"),
      rpcName: "cira_unblock_user",
      rpcArgs: { p_user_id: "user-x" },
    },
    {
      name: "listBlocks -> cira_list_blocks",
      call: (repo) => repo.listBlocks(),
      rpcName: "cira_list_blocks",
      rpcArgs: undefined,
      rpcData: [],
    },
    {
      name: "createInvitation() -> cira_create_invitation without args",
      call: (repo) => repo.createInvitation(),
      rpcName: "cira_create_invitation",
      rpcArgs: undefined,
      rpcData: INVITE_ROW,
    },
    {
      name: "createInvitation(ttl) -> cira_create_invitation with p_ttl_seconds",
      call: (repo) => repo.createInvitation(600),
      rpcName: "cira_create_invitation",
      rpcArgs: { p_ttl_seconds: 600 },
      rpcData: INVITE_ROW,
    },
    {
      name: "previewInvitation -> cira_preview_invitation",
      call: (repo) => repo.previewInvitation("CIRA-AB12-CD34-EF56-GH78-JK90"),
      rpcName: "cira_preview_invitation",
      rpcArgs: { p_code: "CIRAAB12CD34EF56GH78JK90" },
      rpcData: {
        creator_handle: "marie",
        creator_display_name: "Marie",
        creator_avatar_key: null,
        expires_at: "2026-07-13T12:15:00Z",
      },
    },
    {
      name: "acceptInvitation -> cira_accept_invitation",
      call: (repo) => repo.acceptInvitation("CIRA-AB12-CD34-EF56-GH78-JK90"),
      rpcName: "cira_accept_invitation",
      rpcArgs: { p_code: "CIRAAB12CD34EF56GH78JK90" },
    },
    {
      name: "declineInvitation -> cira_decline_invitation",
      call: (repo) => repo.declineInvitation("CIRA-AB12-CD34-EF56-GH78-JK90"),
      rpcName: "cira_decline_invitation",
      rpcArgs: { p_code: "CIRAAB12CD34EF56GH78JK90" },
    },
    {
      name: "revokeInvitation -> cira_revoke_invitation",
      call: (repo) => repo.revokeInvitation("inv-1"),
      rpcName: "cira_revoke_invitation",
      rpcArgs: { p_invitation_id: "inv-1" },
    },
    {
      name: "listGroups -> cira_list_groups",
      call: (repo) => repo.listGroups(),
      rpcName: "cira_list_groups",
      rpcArgs: undefined,
      rpcData: [],
    },
    {
      name: "createGroup -> cira_create_group",
      call: (repo) => repo.createGroup({ name: "Night crew", description: "Private circle", avatarKey: null, maxMembers: 100 }),
      rpcName: "cira_create_group",
      rpcArgs: { p_name: "Night crew", p_description: "Private circle", p_avatar_key: null, p_max_members: 100 },
      rpcData: GROUP_ROW,
    },
    {
      name: "updateGroup -> cira_update_group",
      call: (repo) => repo.updateGroup("g1", { name: "Night crew", description: null, avatarKey: "moon", maxMembers: 50 }),
      rpcName: "cira_update_group",
      rpcArgs: { p_group_id: "g1", p_name: "Night crew", p_description: null, p_avatar_key: "moon", p_max_members: 50 },
      rpcData: { ...GROUP_ROW, avatar_key: "moon", max_members: 50, description: null },
    },
    { name: "deleteGroup -> cira_delete_group", call: (repo) => repo.deleteGroup("g1"), rpcName: "cira_delete_group", rpcArgs: { p_group_id: "g1" } },
    { name: "listGroupMembers -> cira_list_group_members", call: (repo) => repo.listGroupMembers("g1"), rpcName: "cira_list_group_members", rpcArgs: { p_group_id: "g1" }, rpcData: [] },
    { name: "removeGroupMember -> cira_remove_group_member", call: (repo) => repo.removeGroupMember("g1", "u2"), rpcName: "cira_remove_group_member", rpcArgs: { p_group_id: "g1", p_user_id: "u2" } },
    { name: "setGroupRole -> cira_set_group_role", call: (repo) => repo.setGroupRole("g1", "u2", "admin"), rpcName: "cira_set_group_role", rpcArgs: { p_group_id: "g1", p_user_id: "u2", p_role: "admin" } },
    { name: "transferGroupOwnership -> cira_transfer_group_ownership", call: (repo) => repo.transferGroupOwnership("g1", "u2"), rpcName: "cira_transfer_group_ownership", rpcArgs: { p_group_id: "g1", p_user_id: "u2" } },
    { name: "leaveGroup -> cira_leave_group", call: (repo) => repo.leaveGroup("g1"), rpcName: "cira_leave_group", rpcArgs: { p_group_id: "g1" } },
    { name: "inviteGroupMember -> cira_invite_group_member", call: (repo) => repo.inviteGroupMember("g1", "u2"), rpcName: "cira_invite_group_member", rpcArgs: { p_group_id: "g1", p_user_id: "u2" } },
    { name: "listGroupInvitations -> cira_list_group_invites", call: (repo) => repo.listGroupInvitations(), rpcName: "cira_list_group_invites", rpcArgs: undefined, rpcData: [] },
    { name: "acceptGroupInvitation -> cira_accept_group_invite", call: (repo) => repo.acceptGroupInvitation("i1"), rpcName: "cira_accept_group_invite", rpcArgs: { p_invitation_id: "i1" } },
    { name: "declineGroupInvitation -> cira_decline_group_invite", call: (repo) => repo.declineGroupInvitation("i1"), rpcName: "cira_decline_group_invite", rpcArgs: { p_invitation_id: "i1" } },
    { name: "cancelGroupInvitation -> cira_cancel_group_invite", call: (repo) => repo.cancelGroupInvitation("i1"), rpcName: "cira_cancel_group_invite", rpcArgs: { p_invitation_id: "i1" } },
    {
      name: "createGroupLink -> cira_create_group_link",
      call: (repo) => repo.createGroupLink("g1", 900),
      rpcName: "cira_create_group_link",
      rpcArgs: { p_group_id: "g1", p_ttl_seconds: 900 },
      rpcData: { link_id: "l1", code: "CIRAGAB12CD34EF56GH78JK90", expires_at: "2026-07-13T12:15:00Z" },
    },
    { name: "listGroupLinks -> cira_list_group_links", call: (repo) => repo.listGroupLinks("g1"), rpcName: "cira_list_group_links", rpcArgs: { p_group_id: "g1" }, rpcData: [] },
    {
      name: "previewGroupLink -> cira_preview_group_link",
      call: (repo) => repo.previewGroupLink("CIRAG-AB12-CD34-EF56-GH78-JK90"),
      rpcName: "cira_preview_group_link",
      rpcArgs: { p_code: "CIRAGAB12CD34EF56GH78JK90" },
      rpcData: { group_id: "g1", group_name: "Night crew", group_description: null, group_avatar_key: null, member_count: 2, creator_handle: "marie", creator_display_name: "Marie", expires_at: "2026-07-13T12:15:00Z" },
    },
    { name: "acceptGroupLink -> cira_accept_group_link", call: (repo) => repo.acceptGroupLink("CIRAG-AB12-CD34-EF56-GH78-JK90"), rpcName: "cira_accept_group_link", rpcArgs: { p_code: "CIRAGAB12CD34EF56GH78JK90" }, rpcData: { group_id: "g1", status: "ok" } },
    { name: "revokeGroupLink -> cira_revoke_group_link", call: (repo) => repo.revokeGroupLink("l1"), rpcName: "cira_revoke_group_link", rpcArgs: { p_link_id: "l1" } },
    {
      name: "setPresenceConsent -> cira_set_presence_consent",
      call: (repo) => repo.setPresenceConsent(true),
      rpcName: "cira_set_presence_consent",
      rpcArgs: { p_opt_in: true },
    },
    {
      name: "heartbeatPresence -> cira_heartbeat_presence",
      call: (repo) => repo.heartbeatPresence("sess-1", "in_vara"),
      rpcName: "cira_heartbeat_presence",
      rpcArgs: { p_session_id: "sess-1", p_state: "in_vara" },
    },
    {
      name: "clearPresence -> cira_clear_presence",
      call: (repo) => repo.clearPresence("sess-1"),
      rpcName: "cira_clear_presence",
      rpcArgs: { p_session_id: "sess-1" },
    },
  ];

  it.each(cases)("$name", async ({ call, rpcName, rpcArgs, rpcData }) => {
    const mock = makeClient();
    if (rpcData !== undefined) mock.rpc.mockResolvedValue({ data: rpcData, error: null });
    await call(createCiraRepository(mock.client));
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(rpcName, rpcArgs);
  });

  it("getMe reads the caller's own row from cira_profiles (no RPC)", async () => {
    const mock = makeClient();
    await createCiraRepository(mock.client).getMe();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).toHaveBeenCalledWith("cira_profiles");
    expect(mock.select).toHaveBeenCalledWith(
      "user_id, handle, display_name, avatar_key, presence_opt_in",
    );
    expect(mock.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(mock.maybeSingle).toHaveBeenCalledTimes(1);
  });
});

describe("error mapping through the repository", () => {
  const sqlCodes: CiraErrorCode[] = [
    "NOT_AUTHENTICATED",
    "PROFILE_REQUIRED",
    "INVALID_PROFILE",
    "HANDLE_UNAVAILABLE",
    "REQUEST_NOT_AVAILABLE",
    "ALREADY_RELATED",
    "INVALID_TRANSITION",
    "INVITATION_UNAVAILABLE",
    "RATE_LIMITED",
    "INVALID_GROUP",
    "GROUP_NOT_FOUND",
    "GROUP_FORBIDDEN",
    "GROUP_CAP_TOO_SMALL",
    "GROUP_FULL",
    "GROUP_MEMBER_NOT_FOUND",
    "INVALID_GROUP_ROLE",
    "GROUP_OWNER_MUST_TRANSFER",
    "GROUP_INVITE_UNAVAILABLE",
    "ALREADY_GROUP_MEMBER",
    "INVALID_GROUP_INVITE",
  ];

  it.each(sqlCodes)("surfaces the stable SQL code %s as CiraError", async (code) => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: code, details: "", hint: "", code: "P0001" },
    });
    const repo = createCiraRepository(mock.client);
    await expect(repo.sendRequest("marie")).rejects.toMatchObject({
      name: "CiraError",
      code,
    });
  });

  it("maps a fetch failure to NETWORK", async () => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" },
    });
    await expect(createCiraRepository(mock.client).acceptRequest("req-1")).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("maps an unrecognised error to UNKNOWN", async () => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: "internal error", details: "", hint: "", code: "XX000" },
    });
    await expect(createCiraRepository(mock.client).blockUser("user-x")).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });

  it("throws NOT_AUTHENTICATED without any rpc call when the session is absent", async () => {
    const mock = makeClient({ session: false });
    const repo = createCiraRepository(mock.client);
    await expect(repo.sendRequest("marie")).rejects.toMatchObject({ code: "NOT_AUTHENTICATED" });
    await expect(repo.getMe()).rejects.toMatchObject({ code: "NOT_AUTHENTICATED" });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("invitation code normalisation (symmetric to private.cira_normalize_invite_code)", () => {
  it("uppercases and strips separators before sending", () => {
    expect(normalizeInviteCode("cira-ab12-cd34-ef56-gh78-jk90")).toBe("CIRAAB12CD34EF56GH78JK90");
    expect(normalizeInviteCode("  CIRA AB12 cd34_EF56-gh78.JK90  ")).toBe(
      "CIRAAB12CD34EF56GH78JK90",
    );
  });

  it("accepts only the generated CIRA prefix and Crockford alphabet", () => {
    expect(requireValidInviteCode("CIRA-AB12-CD34-EF56-GH78-JK90")).toBe(
      "CIRAAB12CD34EF56GH78JK90",
    );
    expect(() => requireValidInviteCode("CIRA-AB12-CD34-EF56-GH78-JK9U")).toThrowError(
      expect.objectContaining({ code: "INVITATION_UNAVAILABLE" }),
    );
    expect(() => requireValidInviteCode("x".repeat(65))).toThrowError(
      expect.objectContaining({ code: "INVITATION_UNAVAILABLE" }),
    );
  });

  it("rejects malformed codes before calling Supabase", async () => {
    const mock = makeClient();
    await expect(createCiraRepository(mock.client).acceptInvitation("not-a-cira-code")).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("sends the normalised form to the RPC", async () => {
    const mock = makeClient();
    await createCiraRepository(mock.client).acceptInvitation(" cira-ab12-cd34-ef56-gh78-jk90 ");
    expect(mock.rpc).toHaveBeenCalledWith("cira_accept_invitation", {
      p_code: "CIRAAB12CD34EF56GH78JK90",
    });
  });
});

describe("group invitation code validation", () => {
  it("accepts only the CIRAG prefix and generated alphabet", () => {
    expect(requireValidGroupInviteCode("CIRAG-AB12-CD34-EF56-GH78-JK90")).toBe(
      "CIRAGAB12CD34EF56GH78JK90",
    );
    expect(() => requireValidGroupInviteCode("CIRA-AB12-CD34-EF56-GH78-JK90")).toThrowError(
      expect.objectContaining({ code: "GROUP_INVITE_UNAVAILABLE" }),
    );
  });

  it("rejects malformed group codes before Supabase", async () => {
    const mock = makeClient();
    await expect(createCiraRepository(mock.client).acceptGroupLink("not-a-code")).rejects.toMatchObject({
      code: "GROUP_INVITE_UNAVAILABLE",
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("createInvitation secret handling", () => {
  it("returns the code and fragment URL without ever touching console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const mock = makeClient();
    mock.rpc.mockResolvedValue({ data: INVITE_ROW, error: null });
    const secret = await createCiraRepository(mock.client).createInvitation(900);
    expect(secret).toEqual({
      invitationId: INVITE_ROW.invitation_id,
      code: INVITE_ROW.code,
      url: `https://vayra.eybo.tech/cira/invite#t=${INVITE_ROW.code}`,
      expiresAt: INVITE_ROW.expires_at,
    });
    expect(secret.url).not.toContain("?");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("SQL row shapes to TS types", () => {
  it("getMe returns null when no profile exists", async () => {
    const mock = makeClient();
    await expect(createCiraRepository(mock.client).getMe()).resolves.toBeNull();
  });

  it("getMe maps the profile row", async () => {
    const mock = makeClient();
    mock.maybeSingle.mockResolvedValue({ data: PROFILE_ROW, error: null });
    await expect(createCiraRepository(mock.client).getMe()).resolves.toEqual({
      userId: USER_ID,
      handle: "elie",
      displayName: "Élie",
      avatarKey: "fox-01",
      presenceOptIn: true,
    });
  });

  it("saveProfile maps the jsonb returned by cira_upsert_profile", async () => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: { ...PROFILE_ROW, avatar_key: null, presence_opt_in: false },
      error: null,
    });
    await expect(
      createCiraRepository(mock.client).saveProfile({
        handle: "elie",
        displayName: "Élie",
        avatarKey: null,
      }),
    ).resolves.toEqual({
      userId: USER_ID,
      handle: "elie",
      displayName: "Élie",
      avatarKey: null,
      presenceOptIn: false,
    });
  });

  it("listRelationships maps presence and direction variants", async () => {
    const base = {
      handle: "marie",
      display_name: "Marie",
      avatar_key: null,
      responded_at: null,
      created_at: "2026-07-13T10:00:00Z",
    };
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: [
        { ...base, friendship_id: "f1", counterpart_id: "u1", status: "accepted", direction: "outgoing", presence: "in_vara" },
        { ...base, friendship_id: "f2", counterpart_id: "u2", status: "accepted", direction: "incoming", presence: "online" },
        { ...base, friendship_id: "f3", counterpart_id: "u3", status: "accepted", direction: "incoming", presence: "offline" },
        { ...base, friendship_id: "f4", counterpart_id: "u4", status: "pending", direction: "outgoing", presence: null },
        { ...base, friendship_id: "f5", counterpart_id: "u5", status: "pending", direction: "incoming", presence: null },
      ],
      error: null,
    });
    const rows = await createCiraRepository(mock.client).listRelationships();
    expect(rows.map((r) => [r.id, r.status, r.direction, r.presence])).toEqual([
      ["f1", "accepted", "accepted", "in_vara"],
      ["f2", "accepted", "accepted", "online"],
      ["f3", "accepted", "accepted", "offline"],
      ["f4", "pending", "outgoing", null],
      ["f5", "pending", "incoming", null],
    ]);
    expect(rows[0].profile).toEqual({
      userId: "u1",
      handle: "marie",
      displayName: "Marie",
      avatarKey: null,
    });
    expect(rows[0].createdAt).toBe("2026-07-13T10:00:00Z");
  });

  it("listBlocks maps rows to profiles (presenceOptIn not exposed -> false)", async () => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: [
        {
          blocked_user_id: "u9",
          handle: "spam",
          display_name: "Spam",
          avatar_key: "cat-02",
          blocked_at: "2026-07-13T09:00:00Z",
        },
      ],
      error: null,
    });
    await expect(createCiraRepository(mock.client).listBlocks()).resolves.toEqual([
      { userId: "u9", handle: "spam", displayName: "Spam", avatarKey: "cat-02", presenceOptIn: false },
    ]);
  });

  it("previewInvitation maps the creator fields", async () => {
    const mock = makeClient();
    mock.rpc.mockResolvedValue({
      data: {
        creator_handle: "marie",
        creator_display_name: "Marie",
        creator_avatar_key: null,
        expires_at: "2026-07-13T12:15:00Z",
      },
      error: null,
    });
    await expect(
      createCiraRepository(mock.client).previewInvitation("CIRA-AB12-CD34-EF56-GH78-JK90"),
    ).resolves.toEqual({ handle: "marie", displayName: "Marie", avatarKey: null });
  });

  it("listInvitations folds status/outcome into the 5-state client enum", async () => {
    const mock = makeClient();
    const base = { created_at: "2026-07-13T12:00:00Z", expires_at: "2026-07-13T12:15:00Z" };
    mock.rpc.mockResolvedValue({
      data: [
        { invitation_id: "i1", status: "active", outcome: null, ...base },
        { invitation_id: "i2", status: "consumed", outcome: "accepted", ...base },
        { invitation_id: "i3", status: "consumed", outcome: "declined", ...base },
        { invitation_id: "i4", status: "revoked", outcome: null, ...base },
        { invitation_id: "i5", status: "expired", outcome: null, ...base },
      ],
      error: null,
    });
    const list = await createCiraRepository(mock.client).listInvitations();
    expect(list.map((i) => [i.id, i.state])).toEqual([
      ["i1", "active"],
      ["i2", "accepted"],
      ["i3", "declined"],
      ["i4", "revoked"],
      ["i5", "expired"],
    ]);
  });
});

describe("subscribeInvalidations", () => {
  it("opens a private broadcast channel scoped to the user and relays `changed`", async () => {
    const mock = makeClient();
    const onChange = vi.fn();
    createCiraRepository(mock.client).subscribeInvalidations(onChange);
    await flush();
    expect(mock.channel).toHaveBeenCalledWith(`cira:${USER_ID}`, {
      config: { private: true },
    });
    expect(mock.channelOn).toHaveBeenCalledWith(
      "broadcast",
      { event: "changed" },
      expect.any(Function),
    );
    expect(mock.channelSubscribe).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    mock.broadcastHandlers.get("changed")?.();
    mock.broadcastHandlers.get("changed")?.();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe removes the channel exactly once (idempotent)", async () => {
    const mock = makeClient();
    const unsubscribe = createCiraRepository(mock.client).subscribeInvalidations(() => {});
    await flush();
    unsubscribe();
    unsubscribe();
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
    expect(mock.removeChannel).toHaveBeenCalledWith(mock.channel.mock.results[0]?.value);
  });

  it("never opens a channel when unsubscribed before the session resolves", async () => {
    const mock = makeClient();
    const unsubscribe = createCiraRepository(mock.client).subscribeInvalidations(() => {});
    unsubscribe();
    await flush();
    expect(mock.channel).not.toHaveBeenCalled();
    expect(mock.removeChannel).not.toHaveBeenCalled();
  });

  it("stays inert without a session", async () => {
    const mock = makeClient({ session: false });
    const unsubscribe = createCiraRepository(mock.client).subscribeInvalidations(() => {});
    await flush();
    expect(mock.channel).not.toHaveBeenCalled();
    unsubscribe();
    expect(mock.removeChannel).not.toHaveBeenCalled();
  });
});
