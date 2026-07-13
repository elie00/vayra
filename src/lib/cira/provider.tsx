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
import {
  CIRA_PRESENCE_EXPIRY_REFRESH_MS,
  hasExpiringCiraPresence,
} from "./presence-lifecycle";
import {
  reconcilePendingCiraInvite,
  type PendingCiraInvite,
} from "./pending-invite";
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

export type CiraStatus = "loading" | "unavailable" | "signedOut" | "ready" | "error";

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
  const [pendingInvite, setPendingInvite] = useState<PendingCiraInvite | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const userId = user?.id ?? null;

  useEffect(() => {
    setPendingInvite((current) => reconcilePendingCiraInvite(current, userId));
    sessionIdRef.current = crypto.randomUUID();
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    setMe(null);
    setRelationships([]);
    setBlocks([]);
    setInvitations([]);
    if (!userId) {
      setStatus("signedOut");
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
  }, [userId]);

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
      setStatus("error");
    }
  }, [repo]);

  const refreshRelationships = useCallback(async () => {
    if (!repo) return;
    try {
      setRelationships(await repo.listRelationships());
    } catch (err) {
      console.warn("[cira] presence expiry refresh failed", err);
    }
  }, [repo]);

  useEffect(() => {
    if (!repo) return;
    void refresh();
  }, [repo, refresh]);

  // L'expiration d'une présence est un passage du temps, pas une mutation SQL :
  // aucun trigger Realtime ne peut donc annoncer le passage hors ligne. Tant
  // qu'au moins une relation est affichée active, une relecture légère après
  // la TTL serveur empêche un statut en ligne de rester figé indéfiniment.
  const hasExpiringPresence = hasExpiringCiraPresence(relationships);
  useEffect(() => {
    if (!repo || status !== "ready" || !hasExpiringPresence) return;
    const interval = window.setInterval(() => {
      void refreshRelationships();
    }, CIRA_PRESENCE_EXPIRY_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [repo, status, hasExpiringPresence, refreshRelationships]);

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

  const presentInvite = useCallback(
    (code: string) => {
      setPendingInvite({ code, ownerUserId: userId });
    },
    [userId],
  );
  const clearPendingInvite = useCallback(() => {
    setPendingInvite(null);
  }, []);
  const pendingInviteCode = pendingInvite?.code ?? null;

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
