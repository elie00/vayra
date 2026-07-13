import { normalizeRoomCode } from "./protocol";

const RELAY_PARAM = "vayra-relay";
const ROOM_PARAM = "vayra-room";
// Legacy param names, still accepted when parsing so invite links shared before
// the VAYRA rebrand keep resolving.
const LEGACY_RELAY_PARAM = "harbor-relay";
const LEGACY_ROOM_PARAM = "harbor-room";

export type ParsedInvite = {
  relayUrl: string;
  roomCode: string;
};

export const WEB_JOIN_BASE = "https://vayra.eybo.tech";

export function buildInviteUrl(relayUrl: string, roomCode: string, origin?: string): string {
  const local =
    typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)
      ? window.location.origin
      : WEB_JOIN_BASE;
  const base = origin ?? local;
  const params = new URLSearchParams();
  params.set(RELAY_PARAM, relayUrl);
  params.set(ROOM_PARAM, roomCode.toUpperCase());
  return `${base}/?${params.toString()}`;
}

export function parseInviteFromLocation(): ParsedInvite | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const relay = (params.get(RELAY_PARAM) ?? params.get(LEGACY_RELAY_PARAM))?.trim();
  const roomRaw = (params.get(ROOM_PARAM) ?? params.get(LEGACY_ROOM_PARAM))?.trim();
  if (!relay || !roomRaw) return null;
  const room = normalizeRoomCode(roomRaw);
  if (!room) return null;
  if (!/^wss?:\/\//.test(relay)) return null;
  return { relayUrl: relay, roomCode: room };
}

export function clearInviteParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(RELAY_PARAM);
  url.searchParams.delete(ROOM_PARAM);
  url.searchParams.delete(LEGACY_RELAY_PARAM);
  url.searchParams.delete(LEGACY_ROOM_PARAM);
  window.history.replaceState(null, "", url.toString());
}
