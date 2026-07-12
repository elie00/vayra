// FakeTransport — an in-memory SyncTransport for tests. It emulates the broker's
// observable contract (first client becomes host, monotone rev stamping,
// retained snapshot for late joins, fan-out to all clients EXCEPT the author)
// WITHOUT any socket or Tauri. Multiple FakeTransports sharing one FakeHub form
// a single logical room, so tests can drive multi-client scenarios.
//
// This is test-only infrastructure but lives beside local-transport so the
// shared conformance suite can construct it. No imports from player/, tauri, DOM.

import type { PlaybackCommand, PlaybackState, RoomId, RoomMember } from "./types";
import type { SyncTransport, Unsubscribe } from "./transport";

interface RoomInner {
  rev: number;
  snapshot: PlaybackState | null;
  members: FakeTransport[]; // in join order (oldest first) -> host is [0]
}

// The shared broker stand-in. One hub == one broker process.
export class FakeHub {
  private readonly rooms = new Map<RoomId, RoomInner>();

  join(room: RoomId, client: FakeTransport): void {
    let r = this.rooms.get(room);
    if (!r) {
      r = { rev: 0, snapshot: null, members: [] };
      this.rooms.set(room, r);
    }
    if (!r.members.includes(client)) r.members.push(client);
    // Late-join snapshot to the joiner only.
    if (r.snapshot) client._deliverSnapshot(r.snapshot);
    this.broadcastMembers(room);
  }

  leave(room: RoomId, client: FakeTransport): void {
    const r = this.rooms.get(room);
    if (!r) return;
    r.members = r.members.filter((m) => m !== client);
    if (r.members.length === 0) {
      this.rooms.delete(room); // room + snapshot dropped when last leaves
      return;
    }
    this.broadcastMembers(room);
  }

  sendCommand(room: RoomId, author: FakeTransport, cmd: PlaybackCommand): void {
    const r = this.rooms.get(room);
    if (!r) return;
    r.rev += 1; // broker stamps monotone rev
    const stamped: PlaybackCommand = { ...cmd, rev: r.rev };
    for (const m of r.members) {
      if (m !== author) m._deliverCommand(stamped); // fan-out except author
    }
  }

  publishState(room: RoomId, author: FakeTransport, state: PlaybackState): void {
    const r = this.rooms.get(room);
    if (!r) return;
    r.rev += 1;
    const stamped: PlaybackState = { ...state, rev: r.rev };
    r.snapshot = stamped; // retained for late joins
    for (const m of r.members) {
      if (m !== author) m._deliverState(stamped);
    }
  }

  private broadcastMembers(room: RoomId): void {
    const r = this.rooms.get(room);
    if (!r) return;
    const hostId = r.members[0]?._clientId;
    const list: RoomMember[] = r.members.map((m, i) => ({
      clientId: m._clientId,
      name: m._name,
      isHost: m._clientId === hostId,
      joinedAtMs: i, // deterministic join order
    }));
    for (const m of r.members) m._deliverMembers(list);
  }
}

type Cb<T> = (arg: T) => void;

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

export class FakeTransport implements SyncTransport {
  readonly _clientId: string;
  readonly _name: string;
  private readonly hub: FakeHub;
  private room: RoomId | null = null;
  private closed = false;

  private readonly onCommandE = new Emitter<PlaybackCommand>();
  private readonly onStateE = new Emitter<PlaybackState>();
  private readonly onSnapshotE = new Emitter<PlaybackState>();
  private readonly onMembersE = new Emitter<RoomMember[]>();

  constructor(opts: { clientId: string; name: string; hub?: FakeHub }) {
    this._clientId = opts.clientId;
    this._name = opts.name;
    this.hub = opts.hub ?? new FakeHub();
  }

  join(room: RoomId): void {
    if (this.closed) return;
    this.room = room;
    this.hub.join(room, this);
  }

  leave(room: RoomId): void {
    if (this.closed) return;
    this.hub.leave(room, this);
    if (this.room === room) this.room = null;
  }

  sendCommand(cmd: PlaybackCommand): void {
    if (this.closed || !this.room) return;
    this.hub.sendCommand(this.room, this, cmd);
  }

  publishState(state: PlaybackState): void {
    if (this.closed || !this.room) return;
    this.hub.publishState(this.room, this, state);
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
    if (this.room) this.hub.leave(this.room, this);
    this.closed = true;
    this.room = null;
    this.onCommandE.clear();
    this.onStateE.clear();
    this.onSnapshotE.clear();
    this.onMembersE.clear();
  }

  // --- Hub-facing delivery hooks (internal) ---
  _deliverCommand(cmd: PlaybackCommand): void {
    this.onCommandE.emit(cmd);
  }
  _deliverState(state: PlaybackState): void {
    this.onStateE.emit(state);
  }
  _deliverSnapshot(state: PlaybackState): void {
    this.onSnapshotE.emit(state);
  }
  _deliverMembers(members: RoomMember[]): void {
    this.onMembersE.emit(members);
  }
}
