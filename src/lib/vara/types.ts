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

// A group role, mirrored from CIRA. A collection is always scoped to a group,
// so the viewer's role governs what they may do with it.
export type VaraCollectionRole = "owner" | "admin" | "member";

// Catalogue reference types accepted in a collection. Deliberately public: a
// meta id and public poster, never a source, stream, addon or info-hash.
export type VaraCollectionMediaType =
  | "movie"
  | "series"
  | "anime"
  | "tv"
  | "channel";

/** Per-collection member edit policy. */
export type VaraCollectionPolicy = "reader" | "contributor" | "collaborator";

/** Author card, or null when the author left and/or is blocked (masked). */
export type VaraProfileCard = {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
};

export type VaraCollection = {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  memberPolicy: VaraCollectionPolicy;
  membersCanEdit: boolean;
  itemCount: number;
  createdBy: VaraProfileCard | null;
  updatedBy: VaraProfileCard | null;
  myRole: VaraCollectionRole | null;
  /** owner/admin of the group, or this collection's delegate. */
  canManage: boolean;
  /** the viewer holds a delegate grant on this collection. */
  isDelegate: boolean;
  /** may add / edit at least their own items. */
  canEditItems: boolean;
  /** may edit ANY item (collaborator, manager, delegate). */
  canEditAll: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VaraCollectionItem = {
  id: string;
  collectionId: string;
  metaId: string;
  mediaType: VaraCollectionMediaType;
  season: number | null;
  episode: number | null;
  title: string;
  posterUrl: string | null;
  position: number;
  addedBy: VaraProfileCard | null;
  addedAt: string;
};

export type VaraCollectionInput = {
  name: string;
  description: string | null;
  membersCanEdit: boolean;
  /** Full policy for the create path: sets any of the three levels atomically. */
  memberPolicy?: VaraCollectionPolicy;
};

export type VaraCollectionItemInput = {
  metaId: string;
  mediaType: VaraCollectionMediaType;
  title: string;
  season?: number | null;
  episode?: number | null;
  posterUrl?: string | null;
};

export type VaraPage<T> = { items: T[]; hasMore: boolean };

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
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "INVALID_COLLECTION"
  | "COLLECTION_NOT_FOUND"
  | "COLLECTION_FORBIDDEN"
  | "INVALID_COLLECTION_POLICY"
  | "COLLECTION_DELEGATE_UNAVAILABLE"
  | "COLLECTION_LIMIT_REACHED"
  | "INVALID_COLLECTION_ITEM"
  | "COLLECTION_ITEM_LIMIT_REACHED"
  | "COLLECTION_ITEM_DUPLICATE"
  | "COLLECTION_ITEM_NOT_FOUND"
  | "INVALID_PAGE"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export interface VaraRepository {
  createRoom(ttlSeconds?: number, maxMembers?: number, groupId?: string): Promise<VaraRemoteRoom>;
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

  listGroupCollectionsPage(
    groupId: string,
    offset?: number,
    limit?: number,
  ): Promise<VaraPage<VaraCollection>>;
  getCollection(collectionId: string): Promise<VaraCollection>;
  createCollection(groupId: string, input: VaraCollectionInput): Promise<VaraCollection>;
  updateCollection(collectionId: string, input: VaraCollectionInput): Promise<VaraCollection>;
  setCollectionPolicy(collectionId: string, policy: VaraCollectionPolicy): Promise<VaraCollection>;
  deleteCollection(collectionId: string): Promise<void>;

  listCollectionDelegates(collectionId: string): Promise<VaraProfileCard[]>;
  addCollectionDelegate(collectionId: string, userId: string): Promise<void>;
  removeCollectionDelegate(collectionId: string, userId: string): Promise<void>;

  listCollectionItemsPage(
    collectionId: string,
    offset?: number,
    limit?: number,
  ): Promise<VaraPage<VaraCollectionItem>>;
  addCollectionItem(
    collectionId: string,
    input: VaraCollectionItemInput,
  ): Promise<VaraCollectionItem>;
  removeCollectionItem(itemId: string): Promise<void>;
  moveCollectionItem(itemId: string, position: number): Promise<VaraCollectionItem>;
}
