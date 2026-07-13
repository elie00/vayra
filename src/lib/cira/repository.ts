import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { CiraError, toCiraError } from "./errors";
import type {
  CiraInvitation,
  CiraInviteSecret,
  CiraProfile,
  CiraRelationship,
  CiraRepository,
  CiraVisiblePresence,
} from "./types";

// La page statique transmet le code à l'app sans appel réseau. Le code voyage
// dans le fragment (#t=), jamais en query string.
const INVITE_URL_PREFIX = "https://vayra.eybo.tech/cira/invite#t=";

// Symétrique de private.cira_normalize_invite_code :
// upper() puis suppression de tout caractère hors [0-9A-Z].
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function requireValidInviteCode(code: string): string {
  if (code.length > 64) throw new CiraError("INVITATION_UNAVAILABLE");
  const normalized = normalizeInviteCode(code);
  if (!/^CIRA[0-9A-HJKMNP-TV-Z]{20}$/.test(normalized)) {
    throw new CiraError("INVITATION_UNAVAILABLE");
  }
  return normalized;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null) throw new CiraError("UNKNOWN");
  return value as JsonRecord;
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new CiraError("UNKNOWN");
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asString(value);
}

function toProfile(row: JsonRecord): CiraProfile {
  return {
    userId: asString(row.user_id),
    handle: asString(row.handle),
    displayName: asString(row.display_name),
    avatarKey: asNullableString(row.avatar_key),
    presenceOptIn: row.presence_opt_in === true,
  };
}

function toRelationship(row: JsonRecord): CiraRelationship {
  const status = asString(row.status) === "accepted" ? "accepted" : "pending";
  const presence = asNullableString(row.presence) as CiraVisiblePresence;
  return {
    id: asString(row.friendship_id),
    direction:
      status === "accepted"
        ? "accepted"
        : asString(row.direction) === "outgoing"
          ? "outgoing"
          : "incoming",
    status,
    profile: {
      userId: asString(row.counterpart_id),
      handle: asString(row.handle),
      displayName: asString(row.display_name),
      avatarKey: asNullableString(row.avatar_key),
    },
    presence,
    createdAt: asString(row.created_at),
  };
}

export function createCiraRepository(client: SupabaseClient): CiraRepository {
  // getSession lit le stockage local (pas de réseau) : session absente ->
  // NOT_AUTHENTICATED sans jamais atteindre PostgREST.
  async function requireUserId(): Promise<string> {
    const { data } = await client.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) throw new CiraError("NOT_AUTHENTICATED");
    return userId;
  }

  async function rpc(fn: string, args?: JsonRecord): Promise<unknown> {
    await requireUserId();
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toCiraError(error);
    return data;
  }

  return {
    async getMe() {
      const userId = await requireUserId();
      const { data, error } = await client
        .from("cira_profiles")
        .select("user_id, handle, display_name, avatar_key, presence_opt_in")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw toCiraError(error);
      return data ? toProfile(asRecord(data)) : null;
    },

    async saveProfile(input) {
      const data = await rpc("cira_upsert_profile", {
        p_handle: input.handle,
        p_display_name: input.displayName,
        p_avatar_key: input.avatarKey,
      });
      return toProfile(asRecord(data));
    },

    async listRelationships() {
      const data = await rpc("cira_list_relationships");
      if (!Array.isArray(data)) throw new CiraError("UNKNOWN");
      return data.map((row) => toRelationship(asRecord(row)));
    },

    async sendRequest(handle) {
      await rpc("cira_send_request", { p_handle: handle });
    },

    async acceptRequest(id) {
      await rpc("cira_accept_request", { p_request_id: id });
    },

    async declineRequest(id) {
      await rpc("cira_decline_request", { p_request_id: id });
    },

    async cancelRequest(id) {
      await rpc("cira_cancel_request", { p_request_id: id });
    },

    // `id` est l'identifiant utilisateur du contact (cira_remove_friend prend
    // p_user_id, pas l'id de la relation).
    async removeFriend(id) {
      await rpc("cira_remove_friend", { p_user_id: id });
    },

    async blockUser(userId) {
      await rpc("cira_block_user", { p_user_id: userId });
    },

    async unblockUser(userId) {
      await rpc("cira_unblock_user", { p_user_id: userId });
    },

    async listBlocks() {
      const data = await rpc("cira_list_blocks");
      if (!Array.isArray(data)) throw new CiraError("UNKNOWN");
      // presence_opt_in n'est pas exposé pour les bloqués : false par défaut.
      return data.map((row) => {
        const record = asRecord(row);
        return {
          userId: asString(record.blocked_user_id),
          handle: asString(record.handle),
          displayName: asString(record.display_name),
          avatarKey: asNullableString(record.avatar_key),
          presenceOptIn: false,
        };
      });
    },

    async createInvitation(ttlSeconds) {
      const data = await rpc(
        "cira_create_invitation",
        ttlSeconds === undefined ? undefined : { p_ttl_seconds: ttlSeconds },
      );
      const record = asRecord(data);
      const code = asString(record.code);
      const secret: CiraInviteSecret = {
        invitationId: asString(record.invitation_id),
        code,
        url: `${INVITE_URL_PREFIX}${code}`,
        expiresAt: asString(record.expires_at),
      };
      return secret;
    },

    async listInvitations() {
      const data = await rpc("cira_list_invitations");
      if (!Array.isArray(data)) throw new CiraError("UNKNOWN");
      return data.map((row): CiraInvitation => {
        const record = asRecord(row);
        // La RPC renvoie status consumed/revoked/expired/active + outcome
        // accepted/declined ; on replie sur l'état client à 5 valeurs.
        const status = asString(record.status);
        const outcome = asNullableString(record.outcome);
        const state: CiraInvitation["state"] =
          status === "consumed"
            ? outcome === "declined"
              ? "declined"
              : "accepted"
            : status === "revoked" || status === "expired"
              ? status
              : "active";
        return {
          id: asString(record.invitation_id),
          createdAt: asString(record.created_at),
          expiresAt: asString(record.expires_at),
          state,
        };
      });
    },

    async previewInvitation(token) {
      const data = await rpc("cira_preview_invitation", { p_code: requireValidInviteCode(token) });
      const record = asRecord(data);
      return {
        handle: asString(record.creator_handle),
        displayName: asString(record.creator_display_name),
        avatarKey: asNullableString(record.creator_avatar_key),
      };
    },

    async acceptInvitation(token) {
      await rpc("cira_accept_invitation", { p_code: requireValidInviteCode(token) });
    },

    async declineInvitation(token) {
      await rpc("cira_decline_invitation", { p_code: requireValidInviteCode(token) });
    },

    async revokeInvitation(id) {
      await rpc("cira_revoke_invitation", { p_invitation_id: id });
    },

    async setPresenceConsent(enabled) {
      await rpc("cira_set_presence_consent", { p_opt_in: enabled });
    },

    async heartbeatPresence(sessionId, state) {
      await rpc("cira_heartbeat_presence", { p_session_id: sessionId, p_state: state });
    },

    async clearPresence(sessionId) {
      await rpc("cira_clear_presence", { p_session_id: sessionId });
    },

    // Broadcast privé par utilisateur (topic `cira:<userId>`), événement
    // `changed` sans payload exploité : le callback déclenche une relecture par
    // RPC côté appelant. Les triggers serveur n'envoient qu'une invalidation,
    // jamais de donnée sociale. L'unsubscribe est idempotent et n'orpheline pas
    // le channel.
    subscribeInvalidations(onChange) {
      let channel: RealtimeChannel | null = null;
      let disposed = false;
      void client.auth.getSession().then(({ data }) => {
        const userId = data.session?.user?.id;
        if (disposed || !userId) return;
        channel = client
          .channel(`cira:${userId}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, () => onChange())
          .subscribe();
      });
      return () => {
        disposed = true;
        if (!channel) return;
        const current = channel;
        channel = null;
        void client.removeChannel(current);
      };
    },
  };
}
