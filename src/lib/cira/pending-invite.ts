export type PendingCiraInvite = {
  code: string;
  /** null means the invite was received while signed out. */
  ownerUserId: string | null;
};

export function reconcilePendingCiraInvite(
  invite: PendingCiraInvite | null,
  nextUserId: string | null,
): PendingCiraInvite | null {
  if (!invite) return null;
  if (invite.ownerUserId === null) {
    return nextUserId === null ? invite : { ...invite, ownerUserId: nextUserId };
  }
  return invite.ownerUserId === nextUserId ? invite : null;
}
