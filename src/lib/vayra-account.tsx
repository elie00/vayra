import { invoke } from "@tauri-apps/api/core";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
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
const isTauriRuntime =
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
// Production and desktop complete auth through the vayra:// deep link. In web
// dev the browser can't route that scheme, so bounce the magic link back to the
// running dev origin and exchange the code in-page (see the DEV effect below).
const REDIRECT_URL =
  import.meta.env.DEV && !isTauriRuntime && typeof window !== "undefined"
    ? `${window.location.origin}/`
    : "vayra://auth/callback";
const DEFAULT_SUPABASE_URL = "https://kbuwutnzqapwnvzgyjtw.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kLf8ZEhewgc7j5qDAVjCrA_FTdPB2uh";

const supabaseUrl = import.meta.env.VITE_VAYRA_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_VAYRA_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

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

let singleton: Promise<SupabaseClient | null> | undefined;

function accountClient(): Promise<SupabaseClient | null> {
  if (singleton !== undefined) return singleton;
  if (!supabaseConfigured) {
    singleton = Promise.resolve(null);
    return singleton;
  }
  singleton = import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: secureStorage,
      },
    }),
  );
  return singleton;
}

// Exposition contrôlée du singleton pour les modules VAYRA (ex. src/lib/cira)
// qui ne doivent JAMAIS créer un second client Supabase. Résout null quand le
// compte VAYRA n'est pas configuré.
export function getVayraSupabaseClient(): Promise<SupabaseClient | null> {
  return accountClient();
}

type VayraAccountValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  clearError: () => void;
  sendMagicLink: (email: string) => Promise<void>;
  refreshAccess: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const VayraAccountContext = createContext<VayraAccountValue | null>(null);

export function VayraAccountProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void accountClient().then((loadedClient) => {
      if (cancelled) return;
      setClient(loadedClient);
      if (!loadedClient) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!client) return;
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

  // DEV-only web bridge: the desktop deep link never fires in a browser, so
  // pick up the ?code= the magic link bounced to this origin and exchange it.
  // Compiled out of production builds (import.meta.env.DEV is statically false).
  useEffect(() => {
    if (!client || isTauriRuntime || !import.meta.env.DEV) return;
    const url = new URL(window.location.href);
    const errDesc = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (!code && !errDesc) return;
    const strip = () => {
      url.searchParams.delete("code");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };
    if (errDesc) {
      setError(errDesc);
      strip();
      return;
    }
    setLoading(true);
    void client.auth.exchangeCodeForSession(code as string).then(({ data, error: exchangeError }) => {
      if (exchangeError) setError(exchangeError.message);
      else setSession(data.session);
      setLoading(false);
      strip();
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

  const refreshAccess = useCallback(async () => {
    if (!client) throw new Error("VAYRA email sign-in is not configured yet.");
    setError(null);
    setLoading(true);
    try {
      const { data, error: refreshError } = await client.auth.refreshSession();
      if (refreshError) {
        setError(refreshError.message);
        throw refreshError;
      }
      setSession(data.session);
      return data.session?.user.app_metadata?.cira_beta === true;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const value = useMemo<VayraAccountValue>(
    () => ({
      configured: supabaseConfigured,
      loading,
      user: session?.user ?? null,
      session,
      error,
      clearError: () => setError(null),
      sendMagicLink,
      refreshAccess,
      signOut,
    }),
    [error, loading, refreshAccess, sendMagicLink, session, signOut],
  );

  return <VayraAccountContext.Provider value={value}>{children}</VayraAccountContext.Provider>;
}

export function useVayraAccount(): VayraAccountValue {
  const value = useContext(VayraAccountContext);
  if (!value) throw new Error("useVayraAccount outside VayraAccountProvider");
  return value;
}
