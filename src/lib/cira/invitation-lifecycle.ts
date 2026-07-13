import type { CiraInvitation } from "./types";

export const CIRA_INVITATION_CLOCK_MS = 30_000;

export function isActiveCiraInvitation(invitation: CiraInvitation, now: number): boolean {
  return invitation.state === "active" && Date.parse(invitation.expiresAt) > now;
}

export function ciraInvitationMinutesRemaining(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}
