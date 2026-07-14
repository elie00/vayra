import type { LumaAuthority } from "./types";

export const LUMA_OPEN_EVENT = "vayra:luma:open";

let currentAuthority: LumaAuthority = "solo";
const listeners = new Set<() => void>();

export function getLumaAuthority(): LumaAuthority {
  return currentAuthority;
}

export function setLumaAuthority(authority: LumaAuthority): void {
  if (currentAuthority === authority) return;
  currentAuthority = authority;
  for (const listener of listeners) listener();
}

export function subscribeLumaAuthority(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function deriveLumaAuthority(input: {
  castActive: boolean;
  togetherJoined: boolean;
  togetherIsHost: boolean;
  varaActive: boolean;
  varaIsHost: boolean;
}): LumaAuthority {
  if (input.castActive) return "cast";
  if (input.togetherJoined) return input.togetherIsHost ? "together-host" : "together-guest";
  if (input.varaActive) return input.varaIsHost ? "vara-host" : "vara-guest";
  return "solo";
}
