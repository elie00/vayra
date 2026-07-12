import { invoke } from "@tauri-apps/api/core";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onVayraAuthCallback } from "./deep-link";

const SESSION_ACCOUNT = "vayra-email-session-v1";
const WEB_SESSION_KEY = "vayra.email.session.v1";
const REDIRECT_URL = "vayra://auth/callback";

const supabaseUrl = import.meta.env.VITE_VAYRA_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_VAYRA_SUPABASE_ANON_KEY?.trim() ?? "";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function credentialAccount(storageKey: string): string {
  const safeKey = storageKey.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 100);
  return `${SESSION_ACCOUNT}:${safeKey}`;
}

function webStorageKey(storageKey: string): string {
  return `${WEB_SESSION_KEY}:${storageKey}`;
}

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isTauri()) {
      return invoke<string | null>("auth_secret_read", { account: credentialAccount(key) }).catch(
        () => null,
      );
    }
    try {
      return localStorage.getItem(webStorageKey(key));
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isTauri()) {
      await invoke("auth_secret_write", { account: credentialAccount(key), content: value });
      return;
    }
    localStorage.setItem(webStorageKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    if (isTauri()) {
      await invoke("auth_secret_write", { account: credentialAccount(key), content: null });
      return;
    }
    localStorage.removeItem(webStorageKey(key));
  },
};

let singleton: SupabaseClient | null | undefined;

function accountClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  if (!supabaseUrl || !supabaseAnonKey) {
    singleton = null;
    return singleton;
  }
  singleton = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: secureStorage,
    },
  });
  return singleton;
}

type VayraAccountValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  clearError: () => void;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const VayraAccountContext = createContext<VayraAccountValue | null>(null);

export function VayraAccountProvider({ children }: { children: ReactNode }) {
  const client = accountClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(client !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) setSession(nextSession);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client) return;
    return onVayraAuthCallback((rawUrl) => {
      const callback = new URL(rawUrl);
      const callbackError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
      if (callbackError) {
        setError(callbackError);
        return;
      }
      const code = callback.searchParams.get("code");
      if (!code) {
        setError("The sign-in link did not contain an authorization code.");
        return;
      }
      setLoading(true);
      void client.auth.exchangeCodeForSession(code).then(({ data, error: exchangeError }) => {
        if (exchangeError) setError(exchangeError.message);
        else setSession(data.session);
        setLoading(false);
      });
    });
  }, [client]);

  const sendMagicLink = useCallback(
    async (email: string) => {
      if (!client) throw new Error("VAYRA email sign-in is not configured yet.");
      setError(null);
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: REDIRECT_URL, shouldCreateUser: true },
      });
      if (signInError) {
        setError(signInError.message);
        throw signInError;
      }
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }
    setSession(null);
  }, [client]);

  const value = useMemo<VayraAccountValue>(
    () => ({
      configured: client !== null,
      loading,
      user: session?.user ?? null,
      session,
      error,
      clearError: () => setError(null),
      sendMagicLink,
      signOut,
    }),
    [client, error, loading, sendMagicLink, session, signOut],
  );

  return <VayraAccountContext.Provider value={value}>{children}</VayraAccountContext.Provider>;
}

export function useVayraAccount(): VayraAccountValue {
  const value = useContext(VayraAccountContext);
  if (!value) throw new Error("useVayraAccount outside VayraAccountProvider");
  return value;
}
