import type { SupabaseClient } from "@supabase/supabase-js";
import { VaraError, toVaraError } from "./errors";
import type {
  VaraMember,
  VaraRemoteRoom,
  VaraRepository,
  VaraRoomInvitation,
  VaraRoomLink,
  VaraRoomLinkPreview,
  VaraRoomLinkSecret,
} from "./types";

const LINK_PREFIX = "https://vayra.eybo.tech/vara/invite#t=";
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new VaraError("UNKNOWN");
  }
  return value as JsonRecord;
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new VaraError("UNKNOWN");
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asString(value);
}

function asNumber(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new VaraError("UNKNOWN");
  }
  return number;
}

function toMember(value: unknown): VaraMember {
  const row = asRecord(value);
  if (typeof row.is_host !== "boolean") throw new VaraError("UNKNOWN");
  return {
    userId: asString(row.user_id),
    handle: asString(row.handle),
    displayName: asString(row.display_name),
    avatarKey: asNullableString(row.avatar_key),
    isHost: row.is_host,
    joinedAt: asString(row.joined_at),
  };
}

export function toVaraRoom(value: unknown): VaraRemoteRoom {
  const row = asRecord(value);
  if (!Array.isArray(row.members)) throw new VaraError("UNKNOWN");
  const topic = asString(row.topic);
  if (!/^vara:[0-9a-f]{32}$/.test(topic)) throw new VaraError("UNKNOWN");
  return {
    id: asString(row.room_id),
    ownerId: asString(row.owner_id),
    hostId: asString(row.host_id),
    topic,
    hostEpoch: asNumber(row.host_epoch),
    hostLeaseUntil: asString(row.host_lease_until),
    maxMembers: asNumber(row.max_members),
    createdAt: asString(row.created_at),
    expiresAt: asString(row.expires_at),
    members: row.members.map(toMember),
  };
}

export function normalizeVaraInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function requireValidVaraInviteCode(code: string): string {
  if (code.length > 64) throw new VaraError("VARA_INVITE_UNAVAILABLE");
  const normalized = normalizeVaraInviteCode(code);
  if (!/^VARA[0-9A-HJKMNP-TV-Z]{20}$/.test(normalized)) {
    throw new VaraError("VARA_INVITE_UNAVAILABLE");
  }
  return normalized;
}

export function createVaraRepository(client: SupabaseClient): VaraRepository {
  async function rpc(fn: string, args?: JsonRecord): Promise<unknown> {
    const { data: authData } = await client.auth.getSession();
    if (!authData.session?.user?.id) throw new VaraError("NOT_AUTHENTICATED");
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toVaraError(error);
    if (typeof data === "object" && data !== null && "error" in data) {
      const code = (data as JsonRecord).error;
      if (typeof code === "string") throw toVaraError({ message: code });
    }
    return data;
  }

  return {
    async createRoom(ttlSeconds, maxMembers) {
      return toVaraRoom(await rpc("vara_create_room", {
        ...(ttlSeconds === undefined ? {} : { p_ttl_seconds: ttlSeconds }),
        ...(maxMembers === undefined ? {} : { p_max_members: maxMembers }),
      }));
    },
    async getRoom(roomId) {
      return toVaraRoom(await rpc("vara_get_room", { p_room_id: roomId }));
    },
    async listRooms() {
      const data = await rpc("vara_list_rooms");
      if (!Array.isArray(data)) throw new VaraError("UNKNOWN");
      return data.map(toVaraRoom);
    },
    async closeRoom(roomId) {
      await rpc("vara_close_room", { p_room_id: roomId });
    },
    async leaveRoom(roomId) {
      await rpc("vara_leave_room", { p_room_id: roomId });
    },
    async renewHostLease(roomId) {
      const row = asRecord(await rpc("vara_renew_host_lease", { p_room_id: roomId }));
      return asString(row.host_lease_until);
    },
    async claimHost(roomId) {
      return toVaraRoom(await rpc("vara_claim_host", { p_room_id: roomId }));
    },
    async transferHost(roomId, userId) {
      return toVaraRoom(await rpc("vara_transfer_host", {
        p_room_id: roomId,
        p_user_id: userId,
      }));
    },

    async inviteMember(roomId, userId) {
      const row = asRecord(await rpc("vara_invite_member", {
        p_room_id: roomId,
        p_user_id: userId,
      }));
      return asString(row.invitation_id);
    },
    async listInvitations() {
      const data = await rpc("vara_list_room_invites");
      if (!Array.isArray(data)) throw new VaraError("UNKNOWN");
      return data.map((value): VaraRoomInvitation => {
        const row = asRecord(value);
        return {
          id: asString(row.invitation_id),
          roomId: asString(row.room_id),
          direction: asString(row.direction) === "incoming" ? "incoming" : "outgoing",
          inviter: {
            userId: asString(row.inviter_id),
            handle: asString(row.inviter_handle),
            displayName: asString(row.inviter_display_name),
          },
          invitee: {
            userId: asString(row.invitee_id),
            handle: asString(row.invitee_handle),
            displayName: asString(row.invitee_display_name),
          },
          memberCount: asNumber(row.member_count),
          createdAt: asString(row.created_at),
          expiresAt: asString(row.expires_at),
        };
      });
    },
    async acceptInvitation(invitationId) {
      return toVaraRoom(await rpc("vara_accept_room_invite", {
        p_invitation_id: invitationId,
      }));
    },
    async declineInvitation(invitationId) {
      await rpc("vara_decline_room_invite", { p_invitation_id: invitationId });
    },
    async cancelInvitation(invitationId) {
      await rpc("vara_cancel_room_invite", { p_invitation_id: invitationId });
    },

    async createLink(roomId, ttlSeconds, maxUses) {
      const row = asRecord(await rpc("vara_create_room_link", {
        p_room_id: roomId,
        ...(ttlSeconds === undefined ? {} : { p_ttl_seconds: ttlSeconds }),
        ...(maxUses === undefined ? {} : { p_max_uses: maxUses }),
      }));
      const code = asString(row.code);
      return {
        id: asString(row.link_id),
        creatorId: (await client.auth.getSession()).data.session?.user?.id ?? "",
        code,
        url: `${LINK_PREFIX}${code}`,
        maxUses: asNumber(row.max_uses),
        useCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: asString(row.expires_at),
      } satisfies VaraRoomLinkSecret;
    },
    async listLinks(roomId) {
      const data = await rpc("vara_list_room_links", { p_room_id: roomId });
      if (!Array.isArray(data)) throw new VaraError("UNKNOWN");
      return data.map((value): VaraRoomLink => {
        const row = asRecord(value);
        return {
          id: asString(row.link_id),
          creatorId: asString(row.creator_id),
          maxUses: asNumber(row.max_uses),
          useCount: asNumber(row.use_count),
          createdAt: asString(row.created_at),
          expiresAt: asString(row.expires_at),
        };
      });
    },
    async previewLink(code) {
      const row = asRecord(await rpc("vara_preview_room_link", {
        p_code: requireValidVaraInviteCode(code),
      }));
      return {
        roomId: asString(row.room_id),
        creatorHandle: asString(row.creator_handle),
        creatorDisplayName: asString(row.creator_display_name),
        memberCount: asNumber(row.member_count),
        expiresAt: asString(row.expires_at),
      } satisfies VaraRoomLinkPreview;
    },
    async acceptLink(code) {
      return toVaraRoom(await rpc("vara_accept_room_link", {
        p_code: requireValidVaraInviteCode(code),
      }));
    },
    async revokeLink(linkId) {
      await rpc("vara_revoke_room_link", { p_link_id: linkId });
    },
  };
}
