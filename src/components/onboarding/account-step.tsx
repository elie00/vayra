import { Check, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useVayraAccount } from "@/lib/vayra-account";

export function AccountStep() {
  const t = useT();
  const { configured, loading, user, error, clearError, sendMagicLink } = useVayraAccount();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    clearError();
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch {
      // The account provider exposes the actionable error inline.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
        {t("Step 2 · VAYRA account")}
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="text-wrap-balance font-display text-[36px] font-medium leading-[1.08] tracking-tight text-ink">
          {t("Your VAYRA account")}
        </h1>
        <p className="max-w-[48ch] text-[15px] leading-relaxed text-ink-muted">
          {t("Use one private VAYRA identity for your profiles, settings, CIRA, and VARA. Stremio stays an optional integration you can connect later in Settings.")}
        </p>
      </div>

      {user ? (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Check size={19} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-accent">{t("VAYRA account connected")}</div>
            <div className="truncate text-[13px] text-ink-muted">{user.email}</div>
          </div>
        </div>
      ) : sent ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <Mail size={15} className="text-accent" />
            {t("Check your inbox")}
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {t("Open the VAYRA sign-in link on this device. Your account will be created automatically if this email is new.")}
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-1 w-fit text-[12px] font-medium text-ink-subtle transition-colors hover:text-ink"
          >
            {t("Use another email")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
              {t("Email")}
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError();
              }}
              autoComplete="email"
              disabled={busy || loading || !configured}
              placeholder="you@example.com"
              className="h-12 rounded-xl border border-edge bg-canvas px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent disabled:opacity-50"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
          {!configured && (
            <p className="rounded-lg bg-info/10 px-3 py-2 text-[12.5px] text-info">
              {t("Email sign-in is not configured in this build yet.")}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || loading || !configured || !email.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
          >
            {busy || loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            {t("Sign in or create my account")}
          </button>
        </form>
      )}
    </div>
  );
}
