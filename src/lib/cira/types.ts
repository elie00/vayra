export type CiraPresence = "offline" | "online" | "in_vara";
export type CiraVisiblePresence = CiraPresence | null; // null = non partagé

export type CiraProfile = {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  presenceOptIn: boolean;
};

export type CiraRelationship = {
  id: string;
  direction: "incoming" | "outgoing" | "accepted";
  status: "pending" | "accepted";
  profile: Pick<CiraProfile, "userId" | "handle" | "displayName" | "avatarKey">;
  presence: CiraVisiblePresence;
  createdAt: string;
};

export type CiraInvitation = {
  id: string;
  createdAt: string;
  expiresAt: string;
  state: "active" | "accepted" | "declined" | "revoked" | "expired";
};

export type CiraInviteSecret = {
  invitationId: string;
  code: string;
  url: string;
  expiresAt: string;
};

export type CiraErrorCode =
  | "NOT_AUTHENTICATED"
  | "PROFILE_REQUIRED"
  | "INVALID_PROFILE"
  | "HANDLE_UNAVAILABLE"
  | "REQUEST_NOT_AVAILABLE"
  | "ALREADY_RELATED"
  | "INVALID_TRANSITION"
  | "INVITATION_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export interface CiraRepository {
  getMe(): Promise<CiraProfile | null>;
  saveProfile(input: {
    handle: string;
    displayName: string;
    avatarKey: string | null;
  }): Promise<CiraProfile>;

  listRelationships(): Promise<CiraRelationship[]>;
  sendRequest(handle: string): Promise<void>;
  acceptRequest(id: string): Promise<void>;
  declineRequest(id: string): Promise<void>;
  cancelRequest(id: string): Promise<void>;
  removeFriend(id: string): Promise<void>;

  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  listBlocks(): Promise<CiraProfile[]>;

  createInvitation(ttlSeconds?: number): Promise<CiraInviteSecret>;
  listInvitations(): Promise<CiraInvitation[]>;
  previewInvitation(token: string): Promise<Pick<CiraProfile, "handle" | "displayName" | "avatarKey">>;
  acceptInvitation(token: string): Promise<void>;
  declineInvitation(token: string): Promise<void>;
  revokeInvitation(id: string): Promise<void>;

  setPresenceConsent(enabled: boolean): Promise<void>;
  heartbeatPresence(sessionId: string, state: "online" | "in_vara"): Promise<void>;
  clearPresence(sessionId: string): Promise<void>;

  subscribeInvalidations(onChange: () => void): () => void;
}
