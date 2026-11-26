import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProfiles } from "@/lib/profiles";
import { useVayraAccount, getVayraSupabaseClient } from "@/lib/vayra-account";
import { useVara } from "@/lib/vara/provider";
import { provisionCiraProfile } from "./auto-profile";
import {
  CIRA_PRESENCE_EXPIRY_REFRESH_MS,
  hasExpiringCiraPresence,
} from "./presence-lifecycle";
import {
  reconcilePendingCiraInvite,
  type PendingCiraInvite,
} from "./pending-invite";
import { createCiraRepository } from "./repository";
import { CiraError } from "./errors";
import { withCiraRetry } from "./retry";
import type {
  CiraInvitation,
  CiraGroup,
  CiraGroupInvitation,
  CiraInboxSummary,
  CiraProfile,
  CiraRelationship,
  CiraRepository,
} from "./types";

// Le rythme respecte la contrainte SQL expires_at - updated_at <= 120 s :
// un battement toutes les 45 s garde une marge confortable.
const HEARTBEAT_MS = 45_000;

export type CiraStatus = "loading" | "unavailable" | "signedOut" | "restricted" | "ready" | "error";

type CiraValue = {
  status: CiraStatus;
  repo: CiraRepository | null;
  /** Profil CIRA du compte connecté ; auto-créé dès la connexion si absent. */
  me: CiraProfile | null;
  /** True while automatic first-time CIRA profile provisioning is in flight. */
  autoProvisioning: boolean;
  /** Non-null only if automatic provisioning failed (enables a graceful retry CTA). */
  autoProvisionError: CiraError | null;
  /** Retries automatic provisioning after a failure. */
  retryProvision: () => Promise<void>;
  /** Saves the unified CIRA profile (handle, displayName, avatarKey) and syncs context state. */
  saveProfile: (input: {
    handle: string;
    displayName: string;
    avatarKey: string | null;
  }) => Promise<CiraProfile>;
  relationships: CiraRelationship[];
  relationshipsHasMore: boolean;
  loadMoreRelationships: () => Promise<void>;
  blocks: CiraProfile[];
  invitations: CiraInvitation[];
  groups: CiraGroup[];
  groupInvitations: CiraGroupInvitation[];
  inbox: CiraInboxSummary | null;
  refresh: () => Promise<void>;
  /** Code d'invitation reçu par deep link, en attente de décision. */
  pendingInviteCode: string | null;
  presentInvite: (code: string) => void;
  clearPendingInvite: () => void;
  pendingGroupInviteCode: string | null;
  presentGroupInvite: (code: string) => void;
  clearPendingGroupInvite: () => void;
};

const CiraContext = createContext<CiraValue | null>(null);

export function useCira(): CiraValue {
  const v = useContext(CiraContext);
  if (!v) throw new Error("CiraProvider missing");
  return v;
}

export function CiraProvider({ children }: { children: React.ReactNode }) {
  const { user } = useVayraAccount();
  const { activeProfile } = useProfiles();
  const { activeRoom, refresh: refreshVara } = useVara();
  const inVara = activeRoom !== null;

  const [repo, setRepo] = useState<CiraRepository | null>(null);
  const [status, setStatus] = useState<CiraStatus>("loading");
  const [me, setMe] = useState<CiraProfile | null>(null);
  const [autoProvisioning, setAutoProvisioning] = useState(false);
  const [autoProvisionError, setAutoProvisionError] = useState<CiraError | null>(null);
  const [relationships, setRelationships] = useState<CiraRelationship[]>([]);
  const [relationshipsHasMore, setRelationshipsHasMore] = useState(false);
  const [blocks, setBlocks] = useState<CiraProfile[]>([]);
  const [invitations, setInvitations] = useState<CiraInvitation[]>([]);
  const [groups, setGroups] = useState<CiraGroup[]>([]);
  const [groupInvitations, setGroupInvitations] = useState<CiraGroupInvitation[]>([]);
  const [inbox, setInbox] = useState<CiraInboxSummary | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingCiraInvite | null>(null);
  const [pendingGroupInvite, setPendingGroupInvite] = useState<PendingCiraInvite | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const autoProvisionedUserRef = useRef<string | null>(null);
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;
  const userEmailRef = useRef<string | null>(user?.email ?? null);
  userEmailRef.current = user?.email ?? null;
  const refreshVaraRef = useRef(refreshVara);
  refreshVaraRef.current = refreshVara;
  const userId = user?.id ?? null;
  const betaAccess = user?.app_metadata?.cira_beta === true;

  useEffect(() => {
    setPendingInvite((current) => reconcilePendingCiraInvite(current, userId));
    setPendingGroupInvite((current) => reconcilePendingCiraInvite(current, userId));
    sessionIdRef.current = crypto.randomUUID();
    autoProvisionedUserRef.current = null;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    setMe(null);
    setAutoProvisioning(false);
    setAutoProvisionError(null);
    setRelationships([]);
    setRelationshipsHasMore(false);
    setBlocks([]);
    setInvitations([]);
    setGroups([]);
    setGroupInvitations([]);
    setInbox(null);
    if (!userId) {
      setStatus("signedOut");
      return;
    }
    if (!betaAccess) {
      setStatus("restricted");
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
  }, [userId, betaAccess]);

  const repoRef = useRef(repo);
  repoRef.current = repo;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const refresh = useCallback(async () => {
    if (!repo) return;
    const load = async () => {
      let profile = await repo.getMe();
      let newlyProvisioned = false;
      const uid = userIdRef.current;
      if (!profile && uid && autoProvisionedUserRef.current !== uid) {
        autoProvisionedUserRef.current = uid;
        if (repoRef.current === repo) {
          setAutoProvisioning(true);
          setAutoProvisionError(null);
        }
        try {
          profile = await provisionCiraProfile(repo, {
            localProfileName: activeProfileRef.current?.name,
            email: userEmailRef.current,
            userId: uid,
            avatar: activeProfileRef.current?.avatar,
          });
          newlyProvisioned = true;
        } catch (err) {
          if (repoRef.current === repo) {
            const ciraErr = err instanceof CiraError ? err : new CiraError("UNKNOWN");
            setAutoProvisionError(ciraErr);
            console.warn("[cira] auto-provision failed", err);
          }
        } finally {
          if (repoRef.current === repo) setAutoProvisioning(false);
        }
      }
      if (repoRef.current !== repo) return;
      setMe(profile);
      if (profile) {
        setAutoProvisionError(null);
        const [rels, blocked, invites, nextGroups, nextGroupInvitations, nextInbox] = await Promise.all([
          repo.listRelationshipsPage(),
          repo.listBlocks(),
          repo.listInvitations(),
          repo.listGroups(),
          repo.listGroupInvitations(),
          repo.getInbox(),
        ]);
        if (repoRef.current !== repo) return;
        setRelationships(rels.items);
        setRelationshipsHasMore(rels.hasMore);
        setBlocks(blocked);
        setInvitations(invites);
        setGroups(nextGroups);
        setGroupInvitations(nextGroupInvitations);
        setInbox(nextInbox);
        if (newlyProvisioned) {
          void refreshVaraRef.current();
        }
      } else {
        setRelationships([]);
        setRelationshipsHasMore(false);
        setBlocks([]);
        setInvitations([]);
        setGroups([]);
        setGroupInvitations([]);
        setInbox(null);
      }
    };
    try {
      await withCiraRetry(load, {
        renewSession: async () => {
          const client = await getVayraSupabaseClient();
          await client?.auth.refreshSession();
        },
        wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        alive: () => repoRef.current === repo,
      });
      if (repoRef.current === repo) setStatus("ready");
    } catch (err) {
      // An attempt for an account signed out meanwhile must not mark the next one.
      if (repoRef.current !== repo) return;
      console.warn("[cira] refresh failed", err, err instanceof CiraError && err.hint ? `(${err.hint})` : "");
      setStatus("error");
    }
  }, [repo]);

  const refreshRelationships = useCallback(async () => {
    if (!repo) return;
    try {
      const page = await repo.listRelationshipsPage();
      setRelationships(page.items);
      setRelationshipsHasMore(page.hasMore);
    } catch (err) {
      console.warn("[cira] presence expiry refresh failed", err);
    }
  }, [repo]);

  const loadMoreRelationships = useCallback(async () => {
    if (!repo || !relationshipsHasMore) return;
    const page = await repo.listRelationshipsPage(relationships.length);
    setRelationships((current) => {
      const known = new Set(current.map((item) => item.id));
      return [...current, ...page.items.filter((item) => !known.has(item.id))];
    });
    setRelationshipsHasMore(page.hasMore);
  }, [repo, relationships.length, relationshipsHasMore]);

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
  const presentGroupInvite = useCallback(
    (code: string) => setPendingGroupInvite({ code, ownerUserId: userId }),
    [userId],
  );
  const clearPendingGroupInvite = useCallback(() => setPendingGroupInvite(null), []);
  const pendingGroupInviteCode = pendingGroupInvite?.code ?? null;

  const retryProvision = useCallback(async () => {
    autoProvisionedUserRef.current = null;
    setAutoProvisionError(null);
    await refresh();
  }, [refresh]);

  const saveProfile = useCallback(
    async (input: { handle: string; displayName: string; avatarKey: string | null }) => {
      if (!repo) throw new CiraError("NOT_AUTHENTICATED");
      const hadProfile = me !== null;
      const saved = await repo.saveProfile(input);
      if (repoRef.current === repo) {
        setMe(saved);
        setAutoProvisionError(null);
        if (!hadProfile) {
          await refresh();
          void refreshVaraRef.current();
        }
      }
      return saved;
    },
    [repo, me, refresh],
  );

  const value = useMemo<CiraValue>(
    () => ({
      status,
      repo,
      me,
      autoProvisioning,
      autoProvisionError,
      retryProvision,
      saveProfile,
      relationships,
      relationshipsHasMore,
      loadMoreRelationships,
      blocks,
      invitations,
      groups,
      groupInvitations,
      inbox,
      refresh,
      pendingInviteCode,
      presentInvite,
      clearPendingInvite,
      pendingGroupInviteCode,
      presentGroupInvite,
      clearPendingGroupInvite,
    }),
    [status, repo, me, autoProvisioning, autoProvisionError, retryProvision, saveProfile, relationships, relationshipsHasMore, loadMoreRelationships, blocks, invitations, groups, groupInvitations, inbox, refresh, pendingInviteCode, presentInvite, clearPendingInvite, pendingGroupInviteCode, presentGroupInvite, clearPendingGroupInvite],
  );

  return <CiraContext.Provider value={value}>{children}</CiraContext.Provider>;
}
