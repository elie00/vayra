import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTogether } from "@/lib/together/provider";
import { useVayraAccount, getVayraSupabaseClient } from "@/lib/vayra-account";
import { createCiraRepository } from "./repository";
import type {
  CiraInvitation,
  CiraProfile,
  CiraRelationship,
  CiraRepository,
} from "./types";

// Le rythme respecte la contrainte SQL expires_at - updated_at <= 120 s :
// un battement toutes les 45 s garde une marge confortable.
const HEARTBEAT_MS = 45_000;

export type CiraStatus = "loading" | "unavailable" | "signedOut" | "ready";

type CiraValue = {
  status: CiraStatus;
  repo: CiraRepository | null;
  /** Profil CIRA du compte connecté ; null tant qu'aucun handle n'est choisi. */
  me: CiraProfile | null;
  relationships: CiraRelationship[];
  blocks: CiraProfile[];
  invitations: CiraInvitation[];
  refresh: () => Promise<void>;
  /** Code d'invitation reçu par deep link, en attente de décision. */
  pendingInviteCode: string | null;
  presentInvite: (code: string) => void;
  clearPendingInvite: () => void;
};

const CiraContext = createContext<CiraValue | null>(null);

export function useCira(): CiraValue {
  const v = useContext(CiraContext);
  if (!v) throw new Error("CiraProvider missing");
  return v;
}

export function CiraProvider({ children }: { children: React.ReactNode }) {
  const { user } = useVayraAccount();
  const { snapshot } = useTogether();
  const inVara = !!snapshot.room;

  const [repo, setRepo] = useState<CiraRepository | null>(null);
  const [status, setStatus] = useState<CiraStatus>("loading");
  const [me, setMe] = useState<CiraProfile | null>(null);
  const [relationships, setRelationships] = useState<CiraRelationship[]>([]);
  const [blocks, setBlocks] = useState<CiraProfile[]>([]);
  const [invitations, setInvitations] = useState<CiraInvitation[]>([]);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRepo(null);
      setStatus("signedOut");
      setMe(null);
      setRelationships([]);
      setBlocks([]);
      setInvitations([]);
      return;
    }
    setStatus("loading");
    void getVayraSupabaseClient().then((client) => {
      if (cancelled) return;
      if (!client) {
        setStatus("unavailable");
        return;
      }
      setRepo(createCiraRepository(client));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const profile = await repo.getMe();
      setMe(profile);
      if (profile) {
        const [rels, blocked, invites] = await Promise.all([
          repo.listRelationships(),
          repo.listBlocks(),
          repo.listInvitations(),
        ]);
        setRelationships(rels);
        setBlocks(blocked);
        setInvitations(invites);
      } else {
        setRelationships([]);
        setBlocks([]);
        setInvitations([]);
      }
      setStatus("ready");
    } catch (err) {
      console.warn("[cira] refresh failed", err);
      setStatus("ready");
    }
  }, [repo]);

  useEffect(() => {
    if (!repo) return;
    void refresh();
  }, [repo, refresh]);

  // Invalidation temps réel : un ping "changed" -> relecture, légèrement
  // coalescée pour absorber les rafales (un accept = plusieurs pings).
  useEffect(() => {
    if (!repo) return;
    let timer: number | null = null;
    const unsubscribe = repo.subscribeInvalidations(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void refresh();
      }, 250);
    });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [repo, refresh]);

  // Battement de présence : uniquement sous consentement explicite. La
  // session est identifiée par un UUID stable pour toute la vie de l'app
  // (identité explicite, jamais "la plus récente").
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const optedIn = status === "ready" && me?.presenceOptIn === true;
  useEffect(() => {
    if (!repo || !optedIn) return;
    const state = inVara ? "in_vara" : "online";
    const beat = () => {
      void repo.heartbeatPresence(sessionIdRef.current, state).catch(() => {});
    };
    beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [repo, optedIn, inVara]);

  // Sortie propre : la session de présence est effacée quand le consentement
  // tombe ou que l'app se ferme (best-effort, la TTL couvre le reste).
  useEffect(() => {
    if (!repo || !optedIn) return;
    const clear = () => {
      void repo.clearPresence(sessionIdRef.current).catch(() => {});
    };
    window.addEventListener("beforeunload", clear);
    return () => {
      window.removeEventListener("beforeunload", clear);
      clear();
    };
  }, [repo, optedIn]);

  const presentInvite = useCallback((code: string) => {
    setPendingInviteCode(code);
  }, []);
  const clearPendingInvite = useCallback(() => {
    setPendingInviteCode(null);
  }, []);

  const value = useMemo<CiraValue>(
    () => ({
      status,
      repo,
      me,
      relationships,
      blocks,
      invitations,
      refresh,
      pendingInviteCode,
      presentInvite,
      clearPendingInvite,
    }),
    [status, repo, me, relationships, blocks, invitations, refresh, pendingInviteCode, presentInvite, clearPendingInvite],
  );

  return <CiraContext.Provider value={value}>{children}</CiraContext.Provider>;
}
