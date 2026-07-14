import type { SupabaseClient } from "@supabase/supabase-js";
import { VaraError, toVaraError } from "./errors";
import type {
  VaraCollection,
  VaraCollectionItem,
  VaraCollectionItemInput,
  VaraCollectionMediaType,
  VaraCollectionRole,
  VaraMember,
  VaraPage,
  VaraProfileCard,
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

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return asNumber(value);
}

const COLLECTION_ROLES: readonly VaraCollectionRole[] = ["owner", "admin", "member"];

function asCollectionRole(value: unknown): VaraCollectionRole | null {
  if (value === null || value === undefined) return null;
  const role = asString(value);
  if ((COLLECTION_ROLES as readonly string[]).includes(role)) {
    return role as VaraCollectionRole;
  }
  throw new VaraError("UNKNOWN");
}

const COLLECTION_MEDIA_TYPES: readonly VaraCollectionMediaType[] = [
  "movie",
  "series",
  "anime",
  "tv",
  "channel",
];

function asCollectionMediaType(value: unknown): VaraCollectionMediaType {
  const type = asString(value);
  if ((COLLECTION_MEDIA_TYPES as readonly string[]).includes(type)) {
    return type as VaraCollectionMediaType;
  }
  throw new VaraError("UNKNOWN");
}

function toProfileCard(value: unknown): VaraProfileCard | null {
  if (value === null || value === undefined) return null;
  const row = asRecord(value);
  return {
    userId: asString(row.user_id),
    handle: asString(row.handle),
    displayName: asString(row.display_name),
    avatarKey: asNullableString(row.avatar_key),
  };
}

export function toCollection(value: unknown): VaraCollection {
  const row = asRecord(value);
  return {
    id: asString(row.collection_id),
    groupId: asString(row.group_id),
    name: asString(row.name),
    description: asNullableString(row.description),
    membersCanEdit: asBoolean(row.members_can_edit),
    itemCount: asNumber(row.item_count),
    createdBy: toProfileCard(row.created_by),
    updatedBy: toProfileCard(row.updated_by),
    myRole: asCollectionRole(row.my_role),
    canManage: asBoolean(row.can_manage),
    canEditItems: asBoolean(row.can_edit_items),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function toCollectionItem(value: unknown): VaraCollectionItem {
  const row = asRecord(value);
  return {
    id: asString(row.item_id),
    collectionId: asString(row.collection_id),
    metaId: asString(row.meta_id),
    mediaType: asCollectionMediaType(row.media_type),
    season: asNullableNumber(row.season),
    episode: asNullableNumber(row.episode),
    title: asString(row.title),
    posterUrl: asNullableString(row.poster_url),
    position: asNumber(row.position),
    addedBy: toProfileCard(row.added_by),
    addedAt: asString(row.added_at),
  };
}

function toPage<T>(value: unknown, decode: (row: unknown) => T): VaraPage<T> {
  const record = asRecord(value);
  if (!Array.isArray(record.items) || typeof record.has_more !== "boolean") {
    throw new VaraError("UNKNOWN");
  }
  return { items: record.items.map(decode), hasMore: record.has_more };
}

// Client-side mirror of the SQL whitelist. Fails fast with the same code the
// server would raise, and — crucially — guarantees the app never sends a
// non-public reference or a non-https/private-host image toward the database.
const META_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
// Host must end in an alphabetic TLD: excludes every IP-literal form (decimal,
// octal AND hexadecimal like 0x7f.0.0.1), localhost, userinfo and IPv6.
const POSTER_URL_RE =
  /^https:\/\/([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(:[0-9]{1,5})?(\/[^\s<>"'\\]*)?$/;
const POSTER_IP_RE = /^https:\/\/[0-9]+(\.[0-9]+)+([:/]|$)/;

export function requireValidCollectionItem(
  input: VaraCollectionItemInput,
): VaraCollectionItemInput {
  const title = input.title.trim();
  const poster = input.posterUrl?.trim() ? input.posterUrl.trim() : null;
  const season = input.season ?? null;
  const episode = input.episode ?? null;
  const episodic = input.mediaType === "series" || input.mediaType === "anime";
  // Season/episode only make sense for episodic types; for anything else we
  // drop them below rather than reject, and never forward the invalid combo
  // the server would refuse.
  const season2 = episodic ? season : null;
  const episode2 = episodic ? episode : null;
  const validSeason = season2 === null || (Number.isInteger(season2) && season2 >= 0 && season2 <= 99999);
  const validEpisode = episode2 === null || (Number.isInteger(episode2) && episode2 >= 0 && episode2 <= 99999);
  if (
    !META_ID_RE.test(input.metaId) ||
    !(COLLECTION_MEDIA_TYPES as readonly string[]).includes(input.mediaType) ||
    !validSeason ||
    !validEpisode ||
    title.length < 1 ||
    title.length > 200 ||
    // Same rule as the SQL check: reject HTML brackets and control chars.
    /[<>\u0000-\u001f\u007f]/.test(title) ||
    (poster !== null &&
      (poster.length > 2048 || !POSTER_URL_RE.test(poster) || POSTER_IP_RE.test(poster)))
  ) {
    throw new VaraError("INVALID_COLLECTION_ITEM");
  }
  return {
    metaId: input.metaId,
    mediaType: input.mediaType,
    title,
    season: season2,
    episode: episode2,
    posterUrl: poster,
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
    async createRoom(ttlSeconds, maxMembers, groupId) {
      return toVaraRoom(await rpc("vara_create_room", {
        ...(ttlSeconds === undefined ? {} : { p_ttl_seconds: ttlSeconds }),
        ...(maxMembers === undefined ? {} : { p_max_members: maxMembers }),
        ...(groupId === undefined ? {} : { p_group_id: groupId }),
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

    async listGroupCollectionsPage(groupId, offset = 0, limit = 50) {
      return toPage(await rpc("vara_list_group_collections_page", {
        p_group_id: groupId,
        p_limit: limit,
        p_offset: offset,
      }), toCollection);
    },
    async getCollection(collectionId) {
      return toCollection(await rpc("vara_get_collection", {
        p_collection_id: collectionId,
      }));
    },
    async createCollection(groupId, input) {
      return toCollection(await rpc("vara_create_collection", {
        p_group_id: groupId,
        p_name: input.name,
        p_description: input.description,
        p_members_can_edit: input.membersCanEdit,
      }));
    },
    async updateCollection(collectionId, input) {
      return toCollection(await rpc("vara_update_collection", {
        p_collection_id: collectionId,
        p_name: input.name,
        p_description: input.description,
        p_members_can_edit: input.membersCanEdit,
      }));
    },
    async deleteCollection(collectionId) {
      await rpc("vara_delete_collection", { p_collection_id: collectionId });
    },

    async listCollectionItemsPage(collectionId, offset = 0, limit = 100) {
      return toPage(await rpc("vara_list_collection_items_page", {
        p_collection_id: collectionId,
        p_limit: limit,
        p_offset: offset,
      }), toCollectionItem);
    },
    async addCollectionItem(collectionId, input) {
      const valid = requireValidCollectionItem(input);
      return toCollectionItem(await rpc("vara_add_collection_item", {
        p_collection_id: collectionId,
        p_meta_id: valid.metaId,
        p_media_type: valid.mediaType,
        p_title: valid.title,
        p_season: valid.season ?? null,
        p_episode: valid.episode ?? null,
        p_poster_url: valid.posterUrl ?? null,
      }));
    },
    async removeCollectionItem(itemId) {
      await rpc("vara_remove_collection_item", { p_item_id: itemId });
    },
    async moveCollectionItem(itemId, position) {
      return toCollectionItem(await rpc("vara_move_collection_item", {
        p_item_id: itemId,
        p_position: position,
      }));
    },
  };
}
