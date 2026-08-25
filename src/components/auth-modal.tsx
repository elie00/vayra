import { Check, ExternalLink, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { openUrl } from "@/lib/window";
import { useVayraAccount } from "@/lib/vayra-account";
import { StremioWebButton } from "./auth-modal/stremio-web-button";

export function AuthModal({ onClose }: { onClose: () => void }) {
  return <VayraEmailModal onClose={onClose} />;
}

function VayraEmailModal({ onClose }: { onClose: () => void }) {
  const { configured, loading, user, error, clearError, sendMagicLink, signOut } = useVayraAccount();
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    clearError();
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch {
      // The provider exposes the actionable error message.
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[210] flex items-center justify-center bg-canvas/80" onClick={onClose}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vayra-auth-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className="animate-modal-in flex w-[min(92vw,420px)] flex-col gap-5 rounded-2xl border border-edge-soft bg-elevated p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Mail size={20} strokeWidth={2} />
          </div>
          <h2 id="vayra-auth-title" className="font-display text-[22px] font-medium tracking-tight text-ink">
            {t("Sign in or create your VAYRA account")}
          </h2>
          <p className="text-center text-[13px] leading-snug text-ink-muted">
            {t("Enter your email to sign in or create your private VAYRA identity. No password required.")}
          </p>
        </div>

        {user ? (
          <div className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent/10 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{t("Connected")}</span>
            <span className="truncate text-[14px] text-ink">{user.email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="self-start text-[12.5px] font-medium text-ink-muted transition-colors hover:text-danger"
            >
              {t("Sign out of VAYRA")}
            </button>
          </div>
        ) : sent ? (
          <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
            {t("Check your inbox and open the VAYRA sign-in link on this device.")}
          </div>
        ) : (
          <>
            <Field label={t("Email")} type="email" value={email} onChange={setEmail} autoFocus disabled={busy || !configured} />
            {!configured && (
              <p className="rounded-lg bg-info/10 px-3 py-2 text-[12px] leading-relaxed text-info">
                {t("Email sign-in is not configured in this build yet.")}
              </p>
            )}
            {error && <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12.5px] text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy || loading || !configured || !email.trim()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy || loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {t("Email me a sign-in link")}
            </button>
          </>
        )}

        <button type="button" onClick={onClose} className="self-start text-[12.5px] text-ink-subtle hover:text-ink-muted">
          {t("Cancel")}
        </button>
      </form>
    </div>,
    document.body,
  );
}

export function StremioAuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signInWithKey } = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyMode, setKeyMode] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (keyMode) {
        await signInWithKey(sessionKey);
      } else {
        await signIn(email, password, remember);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[210] flex items-center justify-center bg-canvas/80"
      onClick={onClose}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="animate-modal-in flex w-[min(92vw,400px)] flex-col gap-5 rounded-2xl border border-edge-soft bg-elevated p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 id="auth-modal-title" className="font-display text-[22px] font-medium tracking-tight text-ink">
            {t("Connect Stremio")}
          </h2>
          <p className="text-center text-[13px] leading-snug text-ink-muted">
            {t("Optional integration for importing or exporting your library, watch progress, and addons.")}
          </p>
        </div>

        <StremioWebButton onDone={onClose} disabled={busy} />

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-edge-soft" />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
            {t("or use email")}
          </span>
          <span className="h-px flex-1 bg-edge-soft" />
        </div>

        {keyMode ? (
          <Field
            label={t("Session key")}
            type="password"
            value={sessionKey}
            onChange={setSessionKey}
            disabled={busy}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              label={t("Email")}
              type="email"
              value={email}
              onChange={setEmail}
              disabled={busy}
            />
            <Field
              label={t("Password")}
              type="password"
              value={password}
              onChange={setPassword}
              disabled={busy}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setKeyMode((v) => !v);
            setError(null);
          }}
          disabled={busy}
          className="self-start text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
        >
          {keyMode
            ? t("Use email and password instead")
            : t("Already signed in on another device? Paste its session key")}
        </button>

        <button
          type="button"
          onClick={() => setRemember((v) => !v)}
          disabled={busy}
          className="flex items-center gap-2.5 self-start text-start"
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
              remember ? "border-ink bg-ink" : "border-edge"
            }`}
          >
            {remember && <Check size={11} strokeWidth={3} className="text-canvas" />}
          </span>
          <span className="flex flex-col">
            <span className="text-[13px] font-medium text-ink">{t("Remember me")}</span>
            <span className="text-[11.5px] text-ink-subtle">{t("Stays signed in on this device only.")}</span>
          </span>
        </button>

        {error && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12.5px] text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || (keyMode ? !sessionKey.trim() : !email || !password)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-edge bg-elevated text-[14px] font-semibold text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {t("Signing in...")}
            </>
          ) : keyMode ? (
            t("Sign in with key")
          ) : (
            t("Sign in with email")
          )}
        </button>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => openUrl("https://www.stremio.com/register")}
            className="flex items-center gap-1.5 text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            <span>{t("Create account")}</span>
            <ExternalLink size={11} />
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoFocus,
  disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <div className="relative">
        <input
          type={isPassword && show ? "text" : type}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete={isPassword ? "current-password" : "email"}
          className={`h-11 w-full rounded-xl border border-edge bg-canvas px-3.5 text-[14px] text-ink outline-none transition-colors focus:border-ink disabled:opacity-50 ${
            isPassword ? "pe-11" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShow((v) => !v)}
            disabled={disabled}
            aria-label={show ? t("Hide password") : t("Show password")}
            title={show ? t("Hide password") : t("Show password")}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-ink-subtle transition-colors hover:text-ink disabled:opacity-50"
          >
            {show ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
          </button>
        )}
      </div>
    </label>
  );
}
