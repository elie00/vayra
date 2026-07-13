export type VaraMember = {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  isHost: boolean;
  joinedAt: string;
};

export type VaraRemoteRoom = {
  id: string;
  ownerId: string;
  hostId: string;
  /** Opaque, rotating Supabase Realtime topic. Never persist client-side. */
  topic: string;
  hostEpoch: number;
  hostLeaseUntil: string;
  maxMembers: number;
  createdAt: string;
  expiresAt: string;
  members: VaraMember[];
};

export type VaraRoomInvitation = {
  id: string;
  roomId: string;
  direction: "incoming" | "outgoing";
  inviter: { userId: string; handle: string; displayName: string };
  invitee: { userId: string; handle: string; displayName: string };
  memberCount: number;
  createdAt: string;
  expiresAt: string;
};

export type VaraRoomLink = {
  id: string;
  creatorId: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  expiresAt: string;
};

export type VaraRoomLinkSecret = VaraRoomLink & {
  code: string;
  url: string;
};

export type VaraRoomLinkPreview = {
  roomId: string;
  creatorHandle: string;
  creatorDisplayName: string;
  memberCount: number;
  expiresAt: string;
};

export type VaraErrorCode =
  | "NOT_AUTHENTICATED"
  | "BETA_ACCESS_REQUIRED"
  | "PROFILE_REQUIRED"
  | "INVALID_VARA_ROOM"
  | "VARA_ROOM_UNAVAILABLE"
  | "VARA_ROOM_FORBIDDEN"
  | "VARA_NOT_HOST"
  | "VARA_HOST_LEASE_ACTIVE"
  | "VARA_HOST_TRANSFER_UNAVAILABLE"
  | "VARA_INVITE_UNAVAILABLE"
  | "ALREADY_VARA_MEMBER"
  | "VARA_ROOM_FULL"
  | "INVALID_VARA_INVITE"
  | "VARA_SYNC_CONFLICT"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export interface VaraRepository {
  createRoom(ttlSeconds?: number, maxMembers?: number): Promise<VaraRemoteRoom>;
  getRoom(roomId: string): Promise<VaraRemoteRoom>;
  listRooms(): Promise<VaraRemoteRoom[]>;
  closeRoom(roomId: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  renewHostLease(roomId: string): Promise<string>;
  claimHost(roomId: string): Promise<VaraRemoteRoom>;
  transferHost(roomId: string, userId: string): Promise<VaraRemoteRoom>;

  inviteMember(roomId: string, userId: string): Promise<string>;
  listInvitations(): Promise<VaraRoomInvitation[]>;
  acceptInvitation(invitationId: string): Promise<VaraRemoteRoom>;
  declineInvitation(invitationId: string): Promise<void>;
  cancelInvitation(invitationId: string): Promise<void>;

  createLink(
    roomId: string,
    ttlSeconds?: number,
    maxUses?: number,
  ): Promise<VaraRoomLinkSecret>;
  listLinks(roomId: string): Promise<VaraRoomLink[]>;
  previewLink(code: string): Promise<VaraRoomLinkPreview>;
  acceptLink(code: string): Promise<VaraRemoteRoom>;
  revokeLink(linkId: string): Promise<void>;
}
