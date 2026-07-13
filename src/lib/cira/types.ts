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

export type CiraGroupRole = "owner" | "admin" | "member";

export type CiraGroup = {
  id: string;
  name: string;
  description: string | null;
  avatarKey: string | null;
  maxMembers: number;
  memberCount: number;
  role: CiraGroupRole;
  createdAt: string;
  updatedAt: string;
};

export type CiraGroupMember = Pick<
  CiraProfile,
  "userId" | "handle" | "displayName" | "avatarKey"
> & {
  role: CiraGroupRole;
  joinedAt: string;
};

export type CiraGroupInvitation = {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarKey: string | null;
  direction: "incoming" | "outgoing";
  inviter: Pick<CiraProfile, "userId" | "handle" | "displayName">;
  invitee: Pick<CiraProfile, "userId" | "handle" | "displayName">;
  createdAt: string;
  expiresAt: string;
};

export type CiraGroupLink = {
  id: string;
  creatorId: string;
  createdAt: string;
  expiresAt: string;
};

export type CiraGroupLinkSecret = CiraGroupLink & {
  code: string;
  url: string;
};

export type CiraGroupLinkPreview = {
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  groupAvatarKey: string | null;
  memberCount: number;
  creatorHandle: string;
  creatorDisplayName: string;
  expiresAt: string;
};

export type CiraInboxSummary = {
  seenAt: string | null;
  friendRequestCount: number;
  groupInvitationCount: number;
  unreadCount: number;
};

export type CiraPage<T> = { items: T[]; hasMore: boolean };

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
  | "INVALID_GROUP"
  | "GROUP_NOT_FOUND"
  | "GROUP_FORBIDDEN"
  | "GROUP_CAP_TOO_SMALL"
  | "GROUP_FULL"
  | "GROUP_MEMBER_NOT_FOUND"
  | "INVALID_GROUP_ROLE"
  | "GROUP_OWNER_MUST_TRANSFER"
  | "GROUP_INVITE_UNAVAILABLE"
  | "ALREADY_GROUP_MEMBER"
  | "INVALID_GROUP_INVITE"
  | "GROUP_BLOCK_CONFLICT"
  | "INVALID_PAGE"
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
  listRelationshipsPage(offset?: number, limit?: number): Promise<CiraPage<CiraRelationship>>;
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

  listGroups(): Promise<CiraGroup[]>;
  createGroup(input: {
    name: string;
    description: string | null;
    avatarKey: string | null;
    maxMembers: number;
  }): Promise<CiraGroup>;
  updateGroup(id: string, input: {
    name: string;
    description: string | null;
    avatarKey: string | null;
    maxMembers: number;
  }): Promise<CiraGroup>;
  deleteGroup(id: string): Promise<void>;
  listGroupMembers(id: string): Promise<CiraGroupMember[]>;
  listGroupMembersPage(id: string, offset?: number, limit?: number): Promise<CiraPage<CiraGroupMember>>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;
  setGroupRole(groupId: string, userId: string, role: "admin" | "member"): Promise<void>;
  transferGroupOwnership(groupId: string, userId: string): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;

  inviteGroupMember(groupId: string, userId: string): Promise<void>;
  listGroupInvitations(): Promise<CiraGroupInvitation[]>;
  acceptGroupInvitation(id: string): Promise<void>;
  declineGroupInvitation(id: string): Promise<void>;
  cancelGroupInvitation(id: string): Promise<void>;
  createGroupLink(groupId: string, ttlSeconds?: number): Promise<CiraGroupLinkSecret>;
  listGroupLinks(groupId: string): Promise<CiraGroupLink[]>;
  previewGroupLink(code: string): Promise<CiraGroupLinkPreview>;
  acceptGroupLink(code: string): Promise<string>;
  revokeGroupLink(id: string): Promise<void>;

  getInbox(): Promise<CiraInboxSummary>;
  markInboxSeen(): Promise<void>;

  setPresenceConsent(enabled: boolean): Promise<void>;
  heartbeatPresence(sessionId: string, state: "online" | "in_vara"): Promise<void>;
  clearPresence(sessionId: string): Promise<void>;

  subscribeInvalidations(onChange: () => void): () => void;
}
