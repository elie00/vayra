// use-veya-sync — VEYA playback-intent reconciler wiring (PR5).
//
// Bridges the PR4 SyncTransport (local broker) to the PlayerBridge using the
// PR1 pure logic (reconcile.ts + anti-loop.ts). This is GLUE ONLY: it does not
// touch the player core bridges (mpv/html5/exo/cast) — it only calls the public
// PlayerBridge surface (play/pause/seek/setRate).
//
// SOLO PLAYBACK IS UNTOUCHED: with inRoom=false, this hook wires NOTHING —
// zero transport calls, no subscriptions, no bridge calls. The returned
// sender is a no-op. The existing solo control path (use-playback-controls)
// is not involved here at all.
//
// Anti-loop lives on this seam:
//   - incoming remote apply flips applyingOrigin='remote' + a suppress window
//     (>= SEEK_APPLY_DEBOUNCE_MS + 250ms) around the bridge.seek/play/pause so
//     the resulting local snapshot/echo is NOT forwarded back to the broker.
//   - outgoing local intent is stamped origin='local' + corr and forwarded via
//     transport ONLY when shouldForward(...) is true AND inRoom.
//
// The framework-free `createVeyaWiring` core owns all the logic so it can be
// unit-tested in the node vitest env without a React renderer; the hook is a
// thin useEffect wrapper.

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { CorrLru, shouldForward } from "@/lib/together/sync/anti-loop";
import {
  HARD_DRIFT,
  SOFT_DRIFT,
  driftAction,
  extrapolateTarget,
  shouldApply,
} from "@/lib/together/sync/reconcile";
import type { SyncTransport } from "@/lib/together/sync/transport";
import type {
  CorrId,
  PlaybackCommand,
  PlaybackState,
  SyncOrigin,
} from "@/lib/together/sync/types";

// Mirrors SEEK_APPLY_DEBOUNCE_MS in ../player-utils (kept in sync). Inlined here
// rather than imported so this glue module does not pull the player-core bridge
// barrel (html5/mpv/exo, which needs a DOM) into the node test environment.
const SEEK_APPLY_DEBOUNCE_MS = 120;

// Suppress window after a remote apply: the debounce plus a coalesce guard so a
// remote-driven snapshot cannot leak back out as a "local" command.
export const VEYA_SUPPRESS_MS = SEEK_APPLY_DEBOUNCE_MS + 250;

// Soft correction nudges playback rate slightly toward the authority instead of
// hard-seeking. Small, bounded, and always reset to 1.0 once converged.
const SOFT_NUDGE_RATE = 1.05;

const THRESHOLDS = { soft: SOFT_DRIFT, hard: HARD_DRIFT };

// A local intent to be stamped + forwarded. `atMs` is the sample time.
export type LocalIntent =
  | { action: "play"; atMs: number }
  | { action: "pause"; atMs: number }
  | { action: "seek"; positionSeconds: number; atMs: number };

export type VeyaSender = (intent: LocalIntent) => void;

export interface VeyaWiring {
  // Outgoing seam (RoomCommandSender.send equivalent).
  send: VeyaSender;
  // Tear down all transport subscriptions.
  dispose: () => void;
}

export interface VeyaWiringDeps {
  transport: SyncTransport;
  getBridge: () => PlayerBridge | null;
  clientId: string;
  getLocalPosition: () => number;
  now: () => number;
}

// Framework-free core. Subscribes to the transport, applies remote intent to the
// bridge behind the anti-loop suppress window, and exposes the outgoing sender.
export function createVeyaWiring(deps: VeyaWiringDeps): VeyaWiring {
  const { transport, getBridge, clientId, getLocalPosition, now } = deps;

  // Anti-loop state shared between the incoming-apply and outgoing-send seams.
  let applyingOrigin: SyncOrigin = "local";
  let suppressUntil = 0;
  let seq = 0;
  let appliedRev = 0;
  let softNudgeActive = false;
  const lru = new CorrLru(64);

  const openSuppress = (): void => {
    applyingOrigin = "remote";
    suppressUntil = now() + VEYA_SUPPRESS_MS;
  };

  const clearSoftNudge = (): void => {
    if (!softNudgeActive) return;
    softNudgeActive = false;
    getBridge()?.setRate(1);
  };

  // Apply an incoming remote command to the bridge behind the suppress window.
  const applyCommand = (cmd: PlaybackCommand): void => {
    const b = getBridge();
    if (!b) return;
    // Dedup: a corr we already applied must not be re-applied (race guard).
    if (lru.has(cmd.corr)) return;
    lru.add(cmd.corr);
    openSuppress();
    if (cmd.action === "play") {
      b.play().catch(() => {});
    } else if (cmd.action === "pause") {
      b.pause();
    } else {
      clearSoftNudge();
      b.seek(cmd.positionSeconds);
    }
  };

  // Reconcile against an authority state heartbeat (drift correction).
  const applyState = (state: PlaybackState): void => {
    const b = getBridge();
    if (!b) return;
    if (!shouldApply(state.rev, appliedRev)) return;
    appliedRev = state.rev;

    const nowMs = now();
    const target = extrapolateTarget(state, nowMs);
    const localPos = getLocalPosition();
    const action = driftAction(localPos, target, THRESHOLDS, state.buffering);

    applyingOrigin = "remote";
    suppressUntil = nowMs + VEYA_SUPPRESS_MS;

    if (action === "suspend") {
      // Authority is buffering: hold correction, do not seek. Drop any nudge.
      clearSoftNudge();
      return;
    }
    if (action === "none") {
      clearSoftNudge();
    } else if (action === "soft") {
      // Soft rate-nudge toward the target instead of a hard jump.
      const ahead = localPos > target;
      softNudgeActive = true;
      b.setRate(ahead ? 1 / SOFT_NUDGE_RATE : SOFT_NUDGE_RATE);
    } else {
      // Hard: jump to the extrapolated authority position.
      clearSoftNudge();
      b.seek(target);
    }

    // Match play/pause intent of the authority.
    if (state.playing) b.play().catch(() => {});
    else b.pause();
  };

  // Late-join snapshot: applied unconditionally (no rev gate) to catch up.
  const applySnapshot = (state: PlaybackState): void => {
    const b = getBridge();
    if (!b) return;
    appliedRev = state.rev;
    const nowMs = now();
    applyingOrigin = "remote";
    suppressUntil = nowMs + VEYA_SUPPRESS_MS;
    clearSoftNudge();
    b.seek(extrapolateTarget(state, nowMs));
    if (state.playing) b.play().catch(() => {});
    else b.pause();
  };

  const offCmd = transport.onCommand(applyCommand);
  const offState = transport.onState(applyState);
  const offSnap = transport.onSnapshot(applySnapshot);

  const send: VeyaSender = (intent) => {
    const nowMs = now();
    // Once the suppress window has elapsed the remote apply is fully settled,
    // so a genuine later local action is allowed again (reopen origin).
    if (applyingOrigin === "remote" && nowMs >= suppressUntil) {
      applyingOrigin = "local";
    }
    // shouldForward drops the intent if we're mid-remote-apply or still inside
    // the suppress window (echo of a remote apply) — that breaks the loop.
    if (!shouldForward("local", applyingOrigin, nowMs, suppressUntil)) return;
    applyingOrigin = "local";
    const corr: CorrId = { member: clientId, seq: ++seq };
    const base = { origin: "local" as const, corr, rev: 0, atMs: intent.atMs };
    let cmd: PlaybackCommand;
    if (intent.action === "seek") {
      cmd = { action: "seek", positionSeconds: intent.positionSeconds, ...base };
    } else if (intent.action === "play") {
      cmd = { action: "play", ...base };
    } else {
      cmd = { action: "pause", ...base };
    }
    lru.add(corr);
    transport.sendCommand(cmd);
  };

  return {
    send,
    dispose: () => {
      offCmd();
      offState();
      offSnap();
    },
  };
}

// React glue: wire the core ONLY while inRoom with a transport. Fully inert
// otherwise (no subscribe, no send). The returned sender is a stable ref that
// no-ops when out of a room, so callers can wire it unconditionally.
export function useVeyaSync(params: {
  inRoom: boolean;
  transport: SyncTransport | null;
  bridgeRef: RefObject<PlayerBridge | null>;
  clientId: string;
  getLocalPosition: () => number;
  now?: () => number;
}): { send: VeyaSender } {
  const { inRoom, transport, bridgeRef, clientId, getLocalPosition } = params;
  const now = params.now ?? Date.now;

  const wiringRef = useRef<VeyaWiring | null>(null);

  // Keep dynamic deps fresh without re-subscribing.
  const nowRef = useRef(now);
  nowRef.current = now;
  const getPosRef = useRef(getLocalPosition);
  getPosRef.current = getLocalPosition;
  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;

  useEffect(() => {
    if (!inRoom || !transport) {
      wiringRef.current = null;
      return;
    }
    const wiring = createVeyaWiring({
      transport,
      getBridge: () => bridgeRef.current,
      clientId: clientIdRef.current,
      getLocalPosition: () => getPosRef.current(),
      now: () => nowRef.current(),
    });
    wiringRef.current = wiring;
    return () => {
      wiring.dispose();
      wiringRef.current = null;
    };
  }, [inRoom, transport, bridgeRef]);

  const sendRef = useRef<VeyaSender>((intent) => {
    // No-op unless a room is active; forwards through the live wiring otherwise.
    wiringRef.current?.send(intent);
  });

  return { send: sendRef.current };
}
