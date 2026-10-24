import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ConnectCommand, ConnectState } from "./host";

// VAYRA Connect, phone side: the Rust link (src-tauri/src/connect_link.rs)
// holds the socket to the paired Mac and reports its status here.

export const LINK_STATUS_EVENT = "vayra:connect-link";

export type PairedMac = { name: string; address: string };
export type LinkStatus = { mac: PairedMac | null; connected: boolean; state: ConnectState | null };

export const NO_LINK: LinkStatus = { mac: null, connected: false, state: null };

export const readPairing = (url: string) => invoke<PairedMac>("connect_link_read", { url });
// These report through LINK_STATUS_EVENT, which must be listened to first.
export const pairWithMac = (url: string) => invoke<void>("connect_link_pair", { url });
export const startLink = () => invoke<void>("connect_link_start");
export const forgetMac = () => invoke<void>("connect_link_forget");
/** Sends a command or a title to the paired Mac; rejects while it is away. */
export const sendToMac = (message: ConnectCommand) => invoke<void>("connect_link_send", { message });

export async function onLinkStatus(handler: (status: LinkStatus) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<LinkStatus>(LINK_STATUS_EVENT, (e) => handler(e.payload));
}

let current: LinkStatus = NO_LINK;
const listeners = new Set<() => void>();

export function setLinkStatus(next: LinkStatus): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The paired Mac and what it plays, as last reported. */
export function useLinkStatus(): LinkStatus {
  return useSyncExternalStore(subscribe, () => current);
}

/** Where the Mac's playback is now: it sends a position only on changes. */
export function macPosition(state: ConnectState, nowMs: number): number {
  if (state.status !== "playing") return state.positionSec;
  const elapsed = Math.max(0, nowMs - state.at) / 1000;
  const position = state.positionSec + elapsed * state.rate;
  return state.durationSec > 0 ? Math.min(position, state.durationSec) : position;
}

const TICK_MS = 1000;

/** The Mac's position, moving on each second while it plays. */
export function useMacPosition(state: ConnectState | null): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = state?.status === "playing";
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);
  return state ? macPosition(state, now) : 0;
}

export function macStatusLabel(status: ConnectState["status"], t: (key: string) => string): string {
  if (status === "playing") return t("Playing");
  if (status === "paused") return t("Paused");
  if (status === "ended") return t("Ended");
  if (status === "error") return t("Playback error");
  return t("Loading…");
}
