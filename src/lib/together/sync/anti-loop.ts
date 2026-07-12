// Pure anti-loop guards (§3.4). No side effects beyond the CorrLru's own
// bounded internal set. No imports from player/, tauri, or DOM.

import type { CorrId, SyncOrigin } from "./types";

// Origin + suppress-window guard at the RoomCommandSender.send seam.
//
// A command should be forwarded to the broker only when it originates from a
// genuine local UI action AND we are not currently inside a remote-apply
// suppression window. Remote-origin actions (consequences of applying an
// incoming command) are never forwarded — this breaks the echo loop.
export function shouldForward(
  origin: SyncOrigin,
  applyingOrigin: SyncOrigin,
  nowMs: number,
  suppressUntilMs: number,
): boolean {
  if (origin === "remote") return false;
  if (applyingOrigin === "remote") return false;
  if (nowMs < suppressUntilMs) return false;
  return true;
}

function corrKey(corr: CorrId): string {
  return `${corr.member}:${corr.seq}`;
}

// Fixed-size LRU of recently-applied corr ids. Used to drop duplicate intents
// when origin state is momentarily wrong (race between apply and seek flush).
export class CorrLru {
  private readonly capacity: number;
  private readonly keys: Set<string> = new Set();

  constructor(capacity = 64) {
    this.capacity = Math.max(1, capacity);
  }

  has(corr: CorrId): boolean {
    return this.keys.has(corrKey(corr));
  }

  // Record a corr as applied. Returns false if it was already present
  // (i.e. a duplicate), true if newly added.
  add(corr: CorrId): boolean {
    const key = corrKey(corr);
    if (this.keys.has(key)) {
      // Refresh recency by re-inserting at the tail.
      this.keys.delete(key);
      this.keys.add(key);
      return false;
    }
    this.keys.add(key);
    if (this.keys.size > this.capacity) {
      // Evict oldest (first inserted).
      const oldest = this.keys.values().next().value as string;
      this.keys.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.keys.size;
  }
}
