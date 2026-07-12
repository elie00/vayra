// LocalSyncTransport — the ONLY file that knows the SyncTransport is backed by
// the local Unix-socket broker (via the PR3 Rust sync-client). It bridges the
// narrow SyncTransport surface to:
//   - Tauri commands  vayra_sync_join / leave / send / publish  (client -> broker)
//   - Tauri events    'vayra://sync-*'                           (broker -> client)
//
// No player wiring here. No room authority here (the broker is the sole
// authority). This file only translates method calls <-> ipc/events and keeps a
// tiny local member roster so it can surface onMembers as a RoomMember[] (the
// broker only emits incremental joined/left plus a full roster in `welcome`).
//
// SOLO PLAYBACK: nothing in this module runs until join() is called. With no
// room, zero vayra_sync_* is invoked.

import type {
  PlaybackCommand,
  PlaybackState,
  RoomId,
  RoomMember,
} from "./types";
import type { SyncTransport, Unsubscribe } from "./transport";

// --- Broker -> client event payloads (mirror BrokerMsg in vara_client.rs) ---
// Rust serde: #[serde(tag = "t", rename_all = "camelCase")]. Each event name in
// EV maps to exactly one variant, so `t` is redundant on the wire but present.

export interface WelcomePayload {
  t: "welcome";
  room: RoomId;
  clientId: string;
  role: "host" | "guest";
  rev: number;
  snapshot: PlaybackState | null;
  members: RoomMember[];
}
export interface MemberJoinedPayload {
  t: "memberJoined";
  room: RoomId;
  member: RoomMember;
}
export interface MemberLeftPayload {
  t: "memberLeft";
  room: RoomId;
  member: RoomMember;
}
export interface HostChangedPayload {
  t: "hostChanged";
  room: RoomId;
  hostClientId: string;
}
export interface CmdPayload {
  t: "cmd";
  room: RoomId;
  cmd: PlaybackCommand;
}
export interface StatePayload {
  t: "state";
  room: RoomId;
  state: PlaybackState;
  rev: number;
}
export interface ErrorPayload {
  t: "error";
  code: string;
  message: string;
}

// Event names emitted by the Rust sync-client (vara_client.rs).
const EV = {
  cmd: "vayra://sync-cmd",
  state: "vayra://sync-state",
  welcome: "vayra://sync-welcome",
  members: "vayra://sync-members",
  host: "vayra://sync-host",
  error: "vayra://sync-error",
} as const;

// --- Minimal Tauri surface we depend on (injectable for tests) ---------------

export type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
export type TauriListen = <T>(
  event: string,
  handler: (e: { payload: T }) => void,
) => Promise<() => void>;

export interface TauriBridge {
  invoke: TauriInvoke;
  listen: TauriListen;
}

// Lazily load @tauri-apps/api the same way the rest of the app does, so this
// module stays importable in non-Tauri contexts (and mockable in tests).
async function defaultBridge(): Promise<TauriBridge> {
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ]);
  return { invoke, listen: listen as unknown as TauriListen };
}

export interface LocalTransportOptions {
  // This instance's stable identity (localStorage "harbor.together.clientId").
  clientId: string;
  name: string;
  // Override the Tauri bridge (tests inject a mock; prod uses the dynamic import).
  bridge?: TauriBridge;
}

type Cb<T> = (arg: T) => void;

// Small typed fan-out register: add returns an Unsubscribe.
class Emitter<T> {
  private readonly cbs = new Set<Cb<T>>();
  add(cb: Cb<T>): Unsubscribe {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }
  emit(arg: T): void {
    for (const cb of [...this.cbs]) cb(arg);
  }
  clear(): void {
    this.cbs.clear();
  }
}

export class LocalTransport implements SyncTransport {
  private readonly clientId: string;
  private readonly name: string;
  private readonly bridgePromise: Promise<TauriBridge>;

  private readonly onCommandE = new Emitter<PlaybackCommand>();
  private readonly onStateE = new Emitter<PlaybackState>();
  private readonly onSnapshotE = new Emitter<PlaybackState>();
  private readonly onMembersE = new Emitter<RoomMember[]>();

  // Local roster, keyed by clientId, so onMembers can surface a full array from
  // the broker's incremental joined/left events. Seeded by `welcome`.
  private readonly roster = new Map<string, RoomMember>();
  private currentRoom: RoomId | null = null;
  private unlisteners: Array<() => void> = [];
  private wired = false;
  private closed = false;

  constructor(opts: LocalTransportOptions) {
    this.clientId = opts.clientId;
    this.name = opts.name;
    this.bridgePromise = opts.bridge
      ? Promise.resolve(opts.bridge)
      : defaultBridge();
  }

  join(room: RoomId): void {
    if (this.closed) return;
    this.currentRoom = room;
    void this.ensureWired();
    void this.bridgePromise.then((b) =>
      b.invoke("vayra_sync_join", {
        room,
        clientId: this.clientId,
        name: this.name,
      }),
    );
  }

  leave(room: RoomId): void {
    if (this.closed) return;
    void this.bridgePromise.then((b) =>
      b.invoke("vayra_sync_leave", { room, clientId: this.clientId }),
    );
    if (this.currentRoom === room) {
      this.currentRoom = null;
      this.roster.clear();
    }
  }

  sendCommand(cmd: PlaybackCommand): void {
    if (this.closed || !this.currentRoom) return;
    const room = this.currentRoom;
    void this.bridgePromise.then((b) =>
      b.invoke("vayra_sync_send", { room, cmd }),
    );
  }

  publishState(state: PlaybackState): void {
    if (this.closed || !this.currentRoom) return;
    const room = this.currentRoom;
    void this.bridgePromise.then((b) =>
      b.invoke("vayra_sync_publish", { room, statePayload: state }),
    );
  }

  onCommand(cb: (cmd: PlaybackCommand) => void): Unsubscribe {
    return this.onCommandE.add(cb);
  }
  onState(cb: (state: PlaybackState) => void): Unsubscribe {
    return this.onStateE.add(cb);
  }
  onSnapshot(cb: (state: PlaybackState) => void): Unsubscribe {
    return this.onSnapshotE.add(cb);
  }
  onMembers(cb: (members: RoomMember[]) => void): Unsubscribe {
    return this.onMembersE.add(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const un of this.unlisteners) {
      try {
        un();
      } catch {
        // ignore teardown errors
      }
    }
    this.unlisteners = [];
    this.onCommandE.clear();
    this.onStateE.clear();
    this.onSnapshotE.clear();
    this.onMembersE.clear();
    this.roster.clear();
    this.currentRoom = null;
  }

  // Subscribe to all vayra://sync-* events exactly once. Idempotent.
  private async ensureWired(): Promise<void> {
    if (this.wired || this.closed) return;
    this.wired = true;
    const b = await this.bridgePromise;
    if (this.closed) return;

    const subs = await Promise.all([
      b.listen<WelcomePayload>(EV.welcome, (e) => this.onWelcome(e.payload)),
      b.listen<MemberJoinedPayload | MemberLeftPayload | HostChangedPayload>(
        EV.members,
        (e) => this.onMemberEvent(e.payload),
      ),
      b.listen<HostChangedPayload>(EV.host, (e) => this.onMemberEvent(e.payload)),
      b.listen<CmdPayload>(EV.cmd, (e) => this.onCmd(e.payload)),
      b.listen<StatePayload>(EV.state, (e) => this.onStateEvent(e.payload)),
      b.listen<ErrorPayload>(EV.error, () => {
        // Errors leave solo playback untouched; nothing to surface on this seam.
      }),
    ]);
    if (this.closed) {
      for (const un of subs) un();
      return;
    }
    this.unlisteners.push(...subs);
  }

  private onWelcome(p: WelcomePayload): void {
    this.roster.clear();
    for (const m of p.members) this.roster.set(m.clientId, m);
    this.onMembersE.emit(this.rosterList());
    if (p.snapshot) this.onSnapshotE.emit(p.snapshot);
  }

  private onMemberEvent(
    p: MemberJoinedPayload | MemberLeftPayload | HostChangedPayload,
  ): void {
    if (p.t === "memberJoined") {
      this.roster.set(p.member.clientId, p.member);
    } else if (p.t === "memberLeft") {
      this.roster.delete(p.member.clientId);
    } else {
      // hostChanged: flip isHost across the roster.
      for (const [id, m] of this.roster) {
        this.roster.set(id, { ...m, isHost: id === p.hostClientId });
      }
    }
    this.onMembersE.emit(this.rosterList());
  }

  private onCmd(p: CmdPayload): void {
    this.onCommandE.emit(p.cmd);
  }

  private onStateEvent(p: StatePayload): void {
    this.onStateE.emit(p.state);
  }

  private rosterList(): RoomMember[] {
    return [...this.roster.values()].sort(
      (a, b) => a.joinedAtMs - b.joinedAtMs,
    );
  }
}
