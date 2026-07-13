import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useTogether } from "@/lib/together/provider";
import type { SyncTransport } from "@/lib/together/sync/transport";
import { WebSocketTransport } from "@/lib/together/sync/websocket-transport";
import { getVayraSupabaseClient, useVayraAccount } from "@/lib/vayra-account";
import { VaraError } from "./errors";
import { createVaraRepository } from "./repository";
import type {
  VaraRemoteRoom,
  VaraRepository,
  VaraRoomInvitation,
} from "./types";

export type VaraStatus =
  | "loading"
  | "unavailable"
  | "signedOut"
  | "restricted"
  | "ready"
  | "error";

type VaraValue = {
  status: VaraStatus;
  repo: VaraRepository | null;
  rooms: VaraRemoteRoom[];
  invitations: VaraRoomInvitation[];
  activeRoom: VaraRemoteRoom | null;
  pendingLinkCode: string | null;
  transport: SyncTransport | null;
  refresh: () => Promise<void>;
  activateRoom: (room: VaraRemoteRoom) => void;
  leaveActiveRoom: () => Promise<void>;
  presentLink: (code: string) => void;
  clearPendingLink: () => void;
};

const VaraContext = createContext<VaraValue | null>(null);

export function useVara(): VaraValue {
  const value = useContext(VaraContext);
  if (!value) throw new Error("useVara outside VaraProvider");
  return value;
}

export function VaraProvider({ children }: { children: ReactNode }) {
  const { user } = useVayraAccount();
  const { clientId } = useTogether();
  const [status, setStatus] = useState<VaraStatus>("loading");
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [repo, setRepo] = useState<VaraRepository | null>(null);
  const [rooms, setRooms] = useState<VaraRemoteRoom[]>([]);
  const [invitations, setInvitations] = useState<VaraRoomInvitation[]>([]);
  const [activeRoom, setActiveRoom] = useState<VaraRemoteRoom | null>(null);
  const [pendingLinkCode, setPendingLinkCode] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const betaAccess = user?.app_metadata?.cira_beta === true;

  useEffect(() => {
    let cancelled = false;
    setClient(null);
    setRepo(null);
    setRooms([]);
    setInvitations([]);
    setActiveRoom(null);
    setPendingLinkCode(null);
    if (!userId) {
      setStatus("signedOut");
      return;
    }
    if (!betaAccess) {
      setStatus("restricted");
      return;
    }
    setStatus("loading");
    void getVayraSupabaseClient().then((nextClient) => {
      if (cancelled) return;
      if (!nextClient) {
        setStatus("unavailable");
        return;
      }
      setClient(nextClient);
      setRepo(createVaraRepository(nextClient));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, betaAccess]);

  const transport = useMemo(() => {
    if (!client || !repo || !userId) return null;
    return new WebSocketTransport({ client, repository: repo, userId, clientId });
  }, [client, repo, userId, clientId]);

  useEffect(() => () => transport?.close(), [transport]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const [nextRooms, nextInvitations] = await Promise.all([
        repo.listRooms(),
        repo.listInvitations(),
      ]);
      setRooms(nextRooms);
      setInvitations(nextInvitations);
      setActiveRoom((current) =>
        current ? nextRooms.find((room) => room.id === current.id) ?? null : null,
      );
      setStatus("ready");
    } catch (error) {
      // A signed-in beta account may not have chosen its CIRA handle yet.
      // That is an empty VARA state, not a service failure.
      if (error instanceof VaraError && error.code === "PROFILE_REQUIRED") {
        setRooms([]);
        setInvitations([]);
        setStatus("ready");
        return;
      }
      setStatus("error");
    }
  }, [repo]);

  useEffect(() => {
    if (repo) void refresh();
  }, [repo, refresh]);

  // The server already emits an empty `changed` ping on the private CIRA
  // per-user topic for room admissions, removals and invitations.
  useEffect(() => {
    if (!client || !userId) return;
    let channel: RealtimeChannel | null = client
      .channel(`cira:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => void refresh())
      .subscribe();
    return () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      void client.removeChannel(current);
    };
  }, [client, userId, refresh]);

  const activateRoom = useCallback((room: VaraRemoteRoom) => {
    if (!transport) return;
    setActiveRoom((current) => {
      if (current && current.id !== room.id) transport.leave(current.id);
      return room;
    });
    transport.join(room.id);
  }, [transport]);

  const leaveActiveRoom = useCallback(async () => {
    const room = activeRoom;
    if (!room || !transport || !repo) return;
    setActiveRoom(null);
    transport.leave(room.id);
    await repo.leaveRoom(room.id);
    await refresh();
  }, [activeRoom, transport, repo, refresh]);

  const presentLink = useCallback((code: string) => setPendingLinkCode(code), []);
  const clearPendingLink = useCallback(() => setPendingLinkCode(null), []);

  const value = useMemo<VaraValue>(() => ({
    status,
    repo,
    rooms,
    invitations,
    activeRoom,
    pendingLinkCode,
    transport,
    refresh,
    activateRoom,
    leaveActiveRoom,
    presentLink,
    clearPendingLink,
  }), [
    status,
    repo,
    rooms,
    invitations,
    activeRoom,
    pendingLinkCode,
    transport,
    refresh,
    activateRoom,
    leaveActiveRoom,
    presentLink,
    clearPendingLink,
  ]);

  return <VaraContext.Provider value={value}>{children}</VaraContext.Provider>;
}
