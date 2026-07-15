import type {
  RealtimeChannel,
  RealtimeChannelSendResponse,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { VaraRemoteRoom, VaraRepository } from "@/lib/vara/types";
import { VaraError } from "@/lib/vara/errors";
import type { SyncTransport, Unsubscribe } from "./transport";
import type {
  PlaybackCommand,
  PlaybackState,
  RoomId,
  RoomMember,
} from "./types";

type Callback<T> = (value: T) => void;

class Emitter<T> {
  private readonly callbacks = new Set<Callback<T>>();
  add(callback: Callback<T>): Unsubscribe {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  emit(value: T): void {
    for (const callback of [...this.callbacks]) callback(value);
  }
  clear(): void {
    this.callbacks.clear();
  }
}

type PresencePayload = {
  userId: string;
  clientId: string;
  joinedAtMs: number;
};

type TimerApi = Pick<typeof globalThis, "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval">;

export type WebSocketTransportOptions = {
  client: SupabaseClient;
  repository: VaraRepository;
  userId: string;
  clientId: string;
  now?: () => number;
  timers?: TimerApi;
};

const PERMANENT_ROOM_ERROR_CODES = new Set<string>([
  "INVALID_VARA_ROOM",
  "VARA_ROOM_UNAVAILABLE",
  "VARA_ROOM_FORBIDDEN",
]);

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;
const LEASE_TICK_MS = 15_000;
const REV_EPOCH_SIZE = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function contentKeyOk(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0 && value.length <= 64);
}

function parseCommand(value: unknown): PlaybackCommand | null {
  if (!isRecord(value) || !isRecord(value.corr)) return null;
  const action = value.action;
  if (action !== "play" && action !== "pause" && action !== "seek") return null;
  if (
    typeof value.corr.member !== "string" ||
    value.corr.member.length === 0 ||
    value.corr.member.length > 128 ||
    !Number.isSafeInteger(value.corr.seq) ||
    !finiteNumber(value.rev) ||
    value.rev < 0 ||
    !finiteNumber(value.atMs) ||
    !contentKeyOk(value.contentKey)
  ) return null;
  const base = {
    origin: "remote" as const,
    corr: { member: value.corr.member, seq: value.corr.seq as number },
    rev: value.rev,
    atMs: value.atMs,
    ...(typeof value.contentKey === "string" ? { contentKey: value.contentKey } : {}),
  };
  if (action === "seek") {
    if (!finiteNumber(value.positionSeconds) || value.positionSeconds < 0) return null;
    return { action, positionSeconds: value.positionSeconds, ...base };
  }
  return { action, ...base };
}

function parseState(value: unknown): PlaybackState | null {
  if (!isRecord(value)) return null;
  if (
    !Number.isSafeInteger(value.rev) ||
    (value.rev as number) < 0 ||
    typeof value.playing !== "boolean" ||
    !finiteNumber(value.positionSec) ||
    value.positionSec < 0 ||
    !finiteNumber(value.rate) ||
    value.rate <= 0 ||
    value.rate > 4 ||
    typeof value.buffering !== "boolean" ||
    typeof value.ended !== "boolean" ||
    !finiteNumber(value.anchorAtMs) ||
    typeof value.updatedBy !== "string" ||
    value.updatedBy.length === 0 ||
    value.updatedBy.length > 128 ||
    typeof value.hostClientId !== "string" ||
    value.hostClientId.length === 0 ||
    value.hostClientId.length > 128 ||
    !contentKeyOk(value.contentKey)
  ) return null;
  return {
    rev: value.rev as number,
    playing: value.playing,
    positionSec: value.positionSec,
    rate: value.rate,
    buffering: value.buffering,
    ended: value.ended,
    anchorAtMs: value.anchorAtMs,
    updatedBy: value.updatedBy,
    hostClientId: value.hostClientId,
    ...(typeof value.contentKey === "string" ? { contentKey: value.contentKey } : {}),
  };
}

export class WebSocketTransport implements SyncTransport {
  private readonly client: SupabaseClient;
  private readonly repository: VaraRepository;
  private readonly userId: string;
  private readonly clientId: string;
  private readonly now: () => number;
  private readonly timers: TimerApi;

  private readonly commandEmitter = new Emitter<PlaybackCommand>();
  private readonly stateEmitter = new Emitter<PlaybackState>();
  private readonly snapshotEmitter = new Emitter<PlaybackState>();
  private readonly membersEmitter = new Emitter<RoomMember[]>();

  private roomId: RoomId | null = null;
  private descriptor: VaraRemoteRoom | null = null;
  private channel: RealtimeChannel | null = null;
  private invalidationChannel: RealtimeChannel | null = null;
  private lastPublishedState: PlaybackState | null = null;
  private revSeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private closed = false;
  private intentionalLeave = false;

  constructor(options: WebSocketTransportOptions) {
    this.client = options.client;
    this.repository = options.repository;
    this.userId = options.userId;
    this.clientId = options.clientId;
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? globalThis;
  }

  join(room: RoomId): void {
    if (this.closed) return;
    if (this.roomId === room && this.channel) return;
    this.intentionalLeave = false;
    this.generation += 1;
    this.roomId = room;
    this.reconnectAttempt = 0;
    this.revSeq = 0;
    void this.connect(this.generation);
    this.ensureInvalidationChannel();
    this.ensureLeaseTimer();
  }

  leave(room: RoomId): void {
    if (this.closed || this.roomId !== room) return;
    this.intentionalLeave = true;
    this.generation += 1;
    this.clearReconnect();
    this.stopLeaseTimer();
    this.removeRoomChannel();
    this.roomId = null;
    this.descriptor = null;
    this.lastPublishedState = null;
    this.membersEmitter.emit([]);
  }

  sendCommand(command: PlaybackCommand): void {
    if (!this.channel || !this.descriptor || !this.roomId) return;
    const stamped: PlaybackCommand = {
      ...command,
      rev: this.nextRev(),
      origin: "local",
    };
    void this.send("cmd", stamped);
  }

  publishState(state: PlaybackState): void {
    if (!this.channel || !this.descriptor || !this.isAuthorityClient()) return;
    const stamped: PlaybackState = {
      ...state,
      rev: this.nextRev(),
      updatedBy: this.clientId,
      hostClientId: this.clientId,
      anchorAtMs: this.now(),
    };
    this.lastPublishedState = stamped;
    void this.send("state", stamped);
  }

  onCommand(callback: (command: PlaybackCommand) => void): Unsubscribe {
    return this.commandEmitter.add(callback);
  }
  onState(callback: (state: PlaybackState) => void): Unsubscribe {
    return this.stateEmitter.add(callback);
  }
  onSnapshot(callback: (state: PlaybackState) => void): Unsubscribe {
    return this.snapshotEmitter.add(callback);
  }
  onMembers(callback: (members: RoomMember[]) => void): Unsubscribe {
    return this.membersEmitter.add(callback);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
    this.clearReconnect();
    this.stopLeaseTimer();
    this.removeRoomChannel();
    if (this.invalidationChannel) {
      void this.client.removeChannel(this.invalidationChannel);
      this.invalidationChannel = null;
    }
    this.roomId = null;
    this.descriptor = null;
    this.lastPublishedState = null;
    this.commandEmitter.clear();
    this.stateEmitter.clear();
    this.snapshotEmitter.clear();
    this.membersEmitter.clear();
  }

  private async connect(generation: number): Promise<void> {
    const roomId = this.roomId;
    if (!roomId || this.closed || generation !== this.generation) return;
    try {
      const descriptor = await this.repository.getRoom(roomId);
      if (this.closed || generation !== this.generation || this.roomId !== roomId) return;
      this.descriptor = descriptor;
      this.removeRoomChannel();
      const channel = this.client.channel(descriptor.topic, {
        config: {
          private: true,
          broadcast: { self: false, ack: true },
          presence: { key: `${this.userId}:${this.clientId}` },
        },
      });
      this.channel = channel;
      this.bindChannel(channel, generation);
      channel.subscribe((status) => {
        if (this.channel !== channel || generation !== this.generation) return;
        if (status === "SUBSCRIBED") {
          this.reconnectAttempt = 0;
          void channel.track({
            userId: this.userId,
            clientId: this.clientId,
            joinedAtMs: this.now(),
          } satisfies PresencePayload);
          void this.send("snapshot-request", { clientId: this.clientId });
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          (status === "CLOSED" && !this.intentionalLeave)
        ) {
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      if (generation !== this.generation || this.intentionalLeave) return;
      if (error instanceof VaraError && PERMANENT_ROOM_ERROR_CODES.has(error.code)) {
        // Room is permanently gone (expired / closed / caller removed): stop
        // retrying and release the channel instead of looping reconnect forever.
        this.teardownUnavailable();
      } else {
        this.scheduleReconnect();
      }
    }
  }

  /** Give up on a permanently-unavailable room without touching server state. */
  private teardownUnavailable(): void {
    this.generation += 1;
    this.clearReconnect();
    this.stopLeaseTimer();
    this.removeRoomChannel();
    this.roomId = null;
    this.descriptor = null;
    this.lastPublishedState = null;
    this.membersEmitter.emit([]);
  }

  private bindChannel(channel: RealtimeChannel, generation: number): void {
    channel
      .on("broadcast", { event: "cmd" }, ({ payload }) => {
        const command = parseCommand(payload);
        if (command && generation === this.generation) this.commandEmitter.emit(command);
      })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const state = parseState(payload);
        if (state && generation === this.generation) this.stateEmitter.emit(state);
      })
      .on("broadcast", { event: "snapshot" }, ({ payload }) => {
        const state = parseState(payload);
        if (state && generation === this.generation) this.snapshotEmitter.emit(state);
      })
      .on("broadcast", { event: "snapshot-request" }, () => {
        if (generation !== this.generation || !this.isAuthorityClient()) return;
        if (this.lastPublishedState) void this.send("snapshot", this.lastPublishedState);
      })
      .on("presence", { event: "sync" }, () => {
        if (generation === this.generation) this.emitMembersFromPresence(channel);
      })
      .on("presence", { event: "join" }, () => {
        if (generation === this.generation) this.emitMembersFromPresence(channel);
      })
      .on("presence", { event: "leave" }, () => {
        if (generation === this.generation) this.emitMembersFromPresence(channel);
      });
  }

  private emitMembersFromPresence(channel: RealtimeChannel): void {
    const descriptor = this.descriptor;
    if (!descriptor) return;
    const trusted = new Map(descriptor.members.map((member) => [member.userId, member]));
    const active: Array<PresencePayload & { name: string }> = [];
    const state = channel.presenceState() as Record<string, unknown[]>;
    for (const presences of Object.values(state)) {
      for (const value of presences) {
        if (!isRecord(value)) continue;
        const userId = value.userId;
        const clientId = value.clientId;
        const joinedAtMs = value.joinedAtMs;
        if (
          typeof userId !== "string" ||
          typeof clientId !== "string" ||
          clientId.length === 0 ||
          clientId.length > 128 ||
          !finiteNumber(joinedAtMs)
        ) continue;
        const member = trusted.get(userId);
        if (!member) continue;
        active.push({ userId, clientId, joinedAtMs, name: member.displayName });
      }
    }
    const authorityClient = active
      .filter((presence) => presence.userId === descriptor.hostId)
      .map((presence) => presence.clientId)
      .sort()[0] ?? null;
    const unique = new Map<string, RoomMember>();
    for (const presence of active) {
      unique.set(presence.clientId, {
        clientId: presence.clientId,
        name: presence.name,
        isHost: presence.clientId === authorityClient,
        joinedAtMs: presence.joinedAtMs,
      });
    }
    this.membersEmitter.emit(
      [...unique.values()].sort((a, b) => a.joinedAtMs - b.joinedAtMs),
    );
  }

  private isAuthorityClient(): boolean {
    const descriptor = this.descriptor;
    const channel = this.channel;
    if (!descriptor || !channel || descriptor.hostId !== this.userId) return false;
    const hostClients: string[] = [];
    const state = channel.presenceState() as Record<string, unknown[]>;
    for (const presences of Object.values(state)) {
      for (const value of presences) {
        if (isRecord(value) && value.userId === this.userId && typeof value.clientId === "string") {
          hostClients.push(value.clientId);
        }
      }
    }
    hostClients.sort();
    return hostClients[0] === this.clientId;
  }

  private nextRev(): number {
    const epoch = this.descriptor?.hostEpoch ?? 1;
    this.revSeq = Math.min(this.revSeq + 1, REV_EPOCH_SIZE - 1);
    return epoch * REV_EPOCH_SIZE + this.revSeq;
  }

  private async send(event: "cmd" | "state" | "snapshot" | "snapshot-request", payload: unknown): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    const response: RealtimeChannelSendResponse = await channel.send({
      type: "broadcast",
      event,
      payload,
    });
    if (response !== "ok" && !this.intentionalLeave) this.scheduleReconnect();
  }

  private ensureInvalidationChannel(): void {
    if (this.invalidationChannel || this.closed) return;
    const channel = this.client
      .channel(`cira:${this.userId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => {
        void this.refreshDescriptor();
      })
      .subscribe();
    this.invalidationChannel = channel;
  }

  private async refreshDescriptor(): Promise<void> {
    const roomId = this.roomId;
    const generation = this.generation;
    if (!roomId || this.closed) return;
    try {
      const next = await this.repository.getRoom(roomId);
      if (generation !== this.generation || roomId !== this.roomId) return;
      const topicChanged = next.topic !== this.descriptor?.topic;
      this.descriptor = next;
      if (topicChanged) {
        this.generation += 1;
        void this.connect(this.generation);
      } else if (this.channel) {
        this.emitMembersFromPresence(this.channel);
      }
    } catch {
      if (generation !== this.generation) return;
      this.removeRoomChannel();
      this.descriptor = null;
      this.membersEmitter.emit([]);
    }
  }

  private ensureLeaseTimer(): void {
    if (this.leaseTimer !== null) return;
    this.leaseTimer = this.timers.setInterval(() => {
      void this.tickLease();
    }, LEASE_TICK_MS) as ReturnType<typeof setInterval>;
  }

  private async tickLease(): Promise<void> {
    const roomId = this.roomId;
    const descriptor = this.descriptor;
    if (!roomId || !descriptor || this.closed) return;
    if (descriptor.hostId === this.userId) {
      try {
        const hostLeaseUntil = await this.repository.renewHostLease(roomId);
        if (this.descriptor?.id === roomId) {
          this.descriptor = { ...this.descriptor, hostLeaseUntil };
        }
      } catch {
        await this.refreshDescriptor();
      }
      return;
    }
    if (Date.parse(descriptor.hostLeaseUntil) > this.now()) return;
    try {
      const next = await this.repository.claimHost(roomId);
      if (this.roomId !== roomId) return;
      this.descriptor = next;
      this.generation += 1;
      this.revSeq = 0;
      void this.connect(this.generation);
    } catch {
      await this.refreshDescriptor();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.closed || this.intentionalLeave || !this.roomId) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      this.generation += 1;
      void this.connect(this.generation);
    }, delay) as ReturnType<typeof setTimeout>;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer === null) return;
    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private stopLeaseTimer(): void {
    if (this.leaseTimer === null) return;
    this.timers.clearInterval(this.leaseTimer);
    this.leaseTimer = null;
  }

  private removeRoomChannel(): void {
    const channel = this.channel;
    this.channel = null;
    if (channel) void this.client.removeChannel(channel);
  }
}
