import type { CiraRelationship } from "./types";

// La TTL serveur est de 90 s. Une relecture légèrement après cette limite
// permet à l'observateur de voir le passage hors ligne même si aucun nouvel
// événement Realtime n'est émis lorsque la ligne expire naturellement.
export const CIRA_PRESENCE_EXPIRY_REFRESH_MS = 95_000;

export function hasExpiringCiraPresence(relationships: CiraRelationship[]): boolean {
  return relationships.some(
    (relationship) =>
      relationship.status === "accepted" &&
      (relationship.presence === "online" || relationship.presence === "in_vara"),
  );
}
