import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { onStremioAuthKey } from "./deep-link";
import { stremioSourceProfileId, useProfiles, type Profile } from "./profiles";
import { getUser, login as apiLogin, type User } from "./stremio";

type Session = { authKey: string; user: User };
type AuthValue = {
  user: User | null;
  authKey: string | null;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signInWithKey: (authKey: string) => Promise<void>;
  signOut: () => void;
};

const PROFILE_KEY_PREFIX = "harbor.auth.";
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function profileAuthKey(id: string): string {
  return PROFILE_KEY_PREFIX + id;
}

function readProfileSession(id: string): Session | null {
  try {
    const raw = localStorage.getItem(profileAuthKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.authKey || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfileSession(id: string, session: Session | null): void {
  try {
    if (session) localStorage.setItem(profileAuthKey(id), JSON.stringify(session));
    else localStorage.removeItem(profileAuthKey(id));
  } catch {
    return;
  }
}

async function readPersistedProfileSession(id: string): Promise<Session | null> {
  const legacy = readProfileSession(id);
  if (!isTauri) return legacy;
  try {
    const raw = await invoke<string | null>("auth_secret_read", { account: id });
    if (raw) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed?.authKey && parsed?.user) return parsed;
    }
    if (legacy) {
      await invoke("auth_secret_write", { account: id, content: JSON.stringify(legacy) });
      writeProfileSession(id, null);
    }
    return legacy;
  } catch {
    return legacy;
  }
}

async function persistProfileSession(id: string, session: Session | null): Promise<void> {
  if (isTauri) {
    try {
      await invoke("auth_secret_write", {
        account: id,
        content: session ? JSON.stringify(session) : null,
      });
      writeProfileSession(id, null);
      return;
    } catch {
      // Preserve the session if the platform credential store is unavailable.
    }
  }
  writeProfileSession(id, session);
}

export function readActiveStremioAuthKey(): string | null {
  try {
    const raw = localStorage.getItem("harbor.profiles.v1");
    if (!raw) return null;
    const state = JSON.parse(raw) as { profiles?: Profile[]; activeId?: string | null };
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const active = profiles.find((p) => p.id === state.activeId) ?? null;
    const sourceId = stremioSourceProfileId(active, profiles);
    if (!sourceId) return null;
    return readProfileSession(sourceId)?.authKey ?? null;
  } catch {
    return null;
  }
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { profiles, activeProfile, updateProfile } = useProfiles();
  const sourceId = stremioSourceProfileId(activeProfile, profiles);

  const [session, setSession] = useState<Session | null>(() =>
    sourceId ? readProfileSession(sourceId) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!sourceId) {
      setSession(null);
      return;
    }
    void readPersistedProfileSession(sourceId).then((stored) => {
      if (!cancelled) setSession(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const commitSession = useCallback(
    (fresh: Session) => {
      if (!activeProfile) {
        setSession(fresh);
        return;
      }
      if (activeProfile.shareStremioWith) {
        updateProfile(activeProfile.id, { shareStremioWith: null });
      }
      void persistProfileSession(activeProfile.id, fresh);
      setSession(fresh);
    },
    [activeProfile, updateProfile],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      commitSession(await apiLogin(email, password));
    },
    [commitSession],
  );

  const signInWithKey = useCallback(
    async (authKey: string) => {
      const key = authKey.trim();
      if (!key) throw new Error("No sign-in key received. Try again.");
      const fetched = await getUser(key).catch(() => null);
      const user: User = fetched?._id ? fetched : { _id: `stremio:${key.slice(0, 10)}`, email: "" };
      commitSession({ authKey: key, user });
    },
    [commitSession],
  );

  // Jumelage : un lien harbor://stremio-auth?key=… (QR affiché sur le desktop)
  // connecte directement ce profil avec la clé de session reçue.
  useEffect(() => onStremioAuthKey((key) => void signInWithKey(key).catch(() => {})), [
    signInWithKey,
  ]);

  const signOut = useCallback(() => {
    if (!activeProfile) {
      setSession(null);
      return;
    }
    if (activeProfile.shareStremioWith) {
      updateProfile(activeProfile.id, { shareStremioWith: null });
    } else {
      void persistProfileSession(activeProfile.id, null);
    }
    setSession(null);
  }, [activeProfile, updateProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      authKey: session?.authKey ?? null,
      signIn,
      signInWithKey,
      signOut,
    }),
    [session, signIn, signInWithKey, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
