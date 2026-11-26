import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, ImagePlus, QrCode, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { avatarUrl } from "@/lib/avatars/url";
import { CiraError, CiraQrError, decodeCiraQrFile, parseCiraDiscoverPayload } from "@/lib/cira";
import type { CiraInviteSecret, CiraProfile } from "@/lib/cira";
import {
  CIRA_INVITATION_CLOCK_MS,
  ciraInvitationMinutesRemaining,
  isActiveCiraInvitation,
} from "@/lib/cira/invitation-lifecycle";
import { useCira } from "@/lib/cira/provider";
import { copyText } from "@/lib/clipboard";
import { useT } from "@/lib/i18n";
import { isMobileDevice } from "@/lib/platform";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useVayraAccount } from "@/lib/vayra-account";
import { useView } from "@/lib/view";
import { PrivateBetaHelpCard } from "./private-beta-help-card";
import { Section, ToggleRow, useSettingsActiveContext } from "./shared";

function errorText(t: ReturnType<typeof useT>, err: unknown): string {
  const code = err instanceof CiraError ? err.code : "UNKNOWN";
  switch (code) {
    case "NOT_AUTHENTICATED":
      return t("Sign in to your VAYRA account first.");
    case "BETA_ACCESS_REQUIRED":
      return t("Rooms and Circle are currently limited to invited beta accounts.");
    case "INVALID_PROFILE":
      return t("That handle or display name isn't valid.");
    case "HANDLE_UNAVAILABLE":
      return t("That handle is already taken.");
    case "REQUEST_NOT_AVAILABLE":
      return t("This request can't be sent. Check the handle and try again.");
    case "ALREADY_RELATED":
      return t("You're already connected with this person.");
    case "INVALID_TRANSITION":
      return t("That action isn't available anymore.");
    case "INVITATION_UNAVAILABLE":
      return t("This invitation is no longer valid. Ask for a fresh link.");
    case "RATE_LIMITED":
      return t("Too many attempts. Wait a moment and try again.");
    case "NETWORK":
      return t("Network error. Check your connection and try again.");
    default:
      return t("Something went wrong. Try again.");
  }
}

function InlineNotice({ text, tone }: { text: string; tone: "error" | "ok" }) {
  return (
    <p className={`text-[12.5px] ${tone === "error" ? "text-danger" : "text-accent"}`}>{text}</p>
  );
}

function PersonRow({
  profile,
  trailing,
}: {
  profile: Pick<CiraProfile, "handle" | "displayName"> & { avatarKey?: string | null };
  trailing: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-elevated ring-1 ring-edge-soft">
          {profile.avatarKey ? (
            <img src={avatarUrl(profile.avatarKey)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <CatAvatar className="h-full w-full" />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium text-ink">{profile.displayName}</span>
          <span className="truncate font-mono text-[12px] text-ink-subtle">@{profile.handle}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{trailing}</div>
    </div>
  );
}

function SmallButton({
  label,
  onClick,
  tone = "neutral",
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger" | "primary";
  disabled?: boolean;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-ink text-canvas hover:scale-[1.02]"
      : tone === "danger"
        ? "border border-edge-soft text-ink-subtle hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
        : "border border-edge-soft text-ink-muted hover:border-edge hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center rounded-lg px-3 text-[12.5px] font-medium transition-[background-color,border-color,color,opacity] disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function UnifiedIdentityCard() {
  const t = useT();
  const { me } = useCira();
  const { setActive } = useSettingsActiveContext();
  const { setView } = useView();
  if (!me) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-soft bg-canvas/40 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-elevated ring-1 ring-edge-soft">
          {me.avatarKey ? (
            <img src={avatarUrl(me.avatarKey)} alt="" className="h-full w-full object-cover" />
          ) : (
            <CatAvatar className="h-full w-full" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-ink">{me.displayName}</span>
          <span className="truncate font-mono text-[12px] text-ink-subtle">@{me.handle}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("salons")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          {t("Open Rooms")}
          <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
        <SmallButton
          label={t("Edit in Account")}
          onClick={() => setActive("account")}
        />
      </div>
    </div>
  );
}

function PresenceCard() {
  const t = useT();
  const { me, repo, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  if (!me || !repo) return null;
  return (
    <Section
      title={t("Presence")}
      subtitle={t("When enabled, your accepted Circle sees whether you're online or in a room. Off by default; turning it off wipes your presence immediately.")}
    >
      <ToggleRow
        label={t("Share my presence with my Circle")}
        sub={t("Only accepted friends ever see it — never pending requests or strangers.")}
        value={me.presenceOptIn}
        onChange={(next) => {
          setError(null);
          void repo
            .setPresenceConsent(next)
            .then(refresh)
            .catch((err) => setError(errorText(t, err)));
        }}
      />
      {error && <InlineNotice text={error} tone="error" />}
    </Section>
  );
}

function InviteCard() {
  const t = useT();
  const { me, repo, invitations, refresh, presentInvite } = useCira();
  const [secret, setSecret] = useState<CiraInviteSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const qrInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mobile = isMobileDevice();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CIRA_INVITATION_CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!secret) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(secret.url, {
      margin: 1,
      width: 196,
      color: { dark: "#111214", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [secret]);

  if (!me || !repo) return null;

  const activeInvitations = invitations.filter((inv) => isActiveCiraInvitation(inv, nowMs));

  const create = async () => {
    setBusy("create");
    setNotice(null);
    try {
      const next = await repo.createInvitation(3600);
      setSecret(next);
      await refresh();
    } catch (err) {
      setNotice({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      await repo.revokeInvitation(id);
      if (secret?.invitationId === id) setSecret(null);
      await refresh();
    } catch (err) {
      setNotice({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const inspectCode = () => {
    const raw = codeDraft.trim();
    if (!raw) return;
    const parsed = parseCiraDiscoverPayload(raw);
    const code = parsed?.code ?? (raw.length >= 16 && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null);
    if (!code) {
      setNotice({ text: t("That doesn't look like a valid invite link or code."), tone: "error" });
      return;
    }
    setNotice(null);
    setCodeDraft("");
    presentInvite(code);
  };

  const scanQrFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("scan-qr");
    setNotice(null);
    try {
      const parsed = await decodeCiraQrFile(file);
      presentInvite(parsed.code);
    } catch (err) {
      const message =
        err instanceof CiraQrError && err.code === "QR_PAYLOAD_UNAVAILABLE"
          ? t("That QR code is not a VAYRA invitation.")
          : t("No invitation QR code could be read from that image.");
      setNotice({ text: message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title={t("Invite links")}
      subtitle={t("Create or revoke short-lived private invitation links and QR codes for your Circle.")}
    >
      <div className="flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <SmallButton
            label={busy === "create" ? t("Creating…") : t("Create invite link")}
            tone="primary"
            disabled={busy !== null}
            onClick={() => void create()}
          />
          {secret && (
            <SmallButton
              label={t("Copy link")}
              onClick={() => {
                void copyText(secret.url).then((ok) => {
                  if (ok) setNotice({ text: t("Invite link copied"), tone: "ok" });
                });
              }}
            />
          )}
        </div>

        {secret && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-edge-soft bg-elevated/60 p-4">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={t("Invitation QR code")}
                className="h-36 w-36 rounded-xl bg-white p-2"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <QrCode size={14} aria-hidden />
                {t("Valid for 60 minutes · single use")}
              </div>
              <p className="break-all font-mono text-[11.5px] text-ink-subtle">{secret.url}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-edge-soft/60 pt-4">
          <input
            value={codeDraft}
            onChange={(e) => setCodeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") inspectCode();
            }}
            placeholder={t("Paste an invite link or code")}
            spellCheck={false}
            autoComplete="off"
            className="h-10 min-w-52 flex-1 rounded-xl border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
          />
          <SmallButton
            label={t("Open invite")}
            disabled={codeDraft.trim().length === 0 || busy !== null}
            onClick={inspectCode}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => qrInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted hover:border-edge hover:text-ink"
          >
            <ImagePlus size={14} aria-hidden />
            {t("QR image")}
          </button>
          {mobile && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted hover:border-edge hover:text-ink"
            >
              <Camera size={14} aria-hidden />
              {t("Scan QR")}
            </button>
          )}
          <input
            ref={qrInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void scanQrFile(file);
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void scanQrFile(file);
            }}
          />
        </div>

        {activeInvitations.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-edge-soft/60 pt-4">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Active invitations")}
            </span>
            {activeInvitations.map((inv) => {
              const mins = ciraInvitationMinutesRemaining(inv.expiresAt, nowMs);
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/50 px-3.5 py-2.5 text-[12.5px]"
                >
                  <span className="flex items-center gap-2 text-ink-muted">
                    <Share2 size={13} aria-hidden />
                    {t("Expires in {minutes} min", { minutes: mins })}
                  </span>
                  <SmallButton
                    label={t("Revoke")}
                    tone="danger"
                    disabled={busy === inv.id}
                    onClick={() => void revoke(inv.id)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {notice && <InlineNotice text={notice.text} tone={notice.tone} />}
      </div>
    </Section>
  );
}

function BlocksCard() {
  const t = useT();
  const { blocks, repo, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  if (!repo || blocks.length === 0) return null;
  return (
    <Section title={t("Blocked")} subtitle={t("Blocked people can't send you requests or invitations.")}>
      <div className="flex flex-col gap-2">
        {blocks.map((p) => (
          <PersonRow
            key={p.userId}
            profile={p}
            trailing={
              <SmallButton
                label={t("Unblock")}
                onClick={() => {
                  setError(null);
                  void repo
                    .unblockUser(p.userId)
                    .then(refresh)
                    .catch((err) => setError(errorText(t, err)));
                }}
              />
            }
          />
        ))}
        {error && <InlineNotice text={error} tone="error" />}
      </div>
    </Section>
  );
}

function InviteDecisionModal() {
  const t = useT();
  const { pendingInviteCode, clearPendingInvite, repo, refresh } = useCira();
  const [preview, setPreview] = useState<Pick<CiraProfile, "handle" | "displayName" | "avatarKey"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, Boolean(pendingInviteCode && repo));

  useEffect(() => {
    if (!pendingInviteCode) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) clearPendingInvite();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingInviteCode, busy, clearPendingInvite]);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!pendingInviteCode || !repo) return;
    let cancelled = false;
    repo
      .previewInvitation(pendingInviteCode)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(t, err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInviteCode, repo]);

  if (!pendingInviteCode || !repo) return null;

  const decide = (accept: boolean) => {
    setBusy(true);
    setError(null);
    const action = accept
      ? repo.acceptInvitation(pendingInviteCode)
      : repo.declineInvitation(pendingInviteCode);
    void action
      .then(async () => {
        await refresh();
        clearPendingInvite();
      })
      .catch((err) => setError(errorText(t, err)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cira-invitation-title"
        tabIndex={-1}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-edge bg-elevated p-6 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="cira-invitation-title" className="font-display text-[18px] font-medium text-ink">
            {t("Circle invitation")}
          </h3>
          <button
            type="button"
            onClick={clearPendingInvite}
            disabled={busy}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {preview ? (
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {t("{name} (@{handle}) invites you to join their Circle.", {
              name: preview.displayName,
              handle: preview.handle,
            })}
          </p>
        ) : error ? (
          <InlineNotice text={error} tone="error" />
        ) : (
          <p className="text-[13px] text-ink-subtle">{t("Loading…")}</p>
        )}
        {preview && (
          <div className="flex items-center justify-end gap-2">
            <SmallButton label={t("Decline")} disabled={busy} onClick={() => decide(false)} />
            <SmallButton label={t("Accept")} tone="primary" disabled={busy} onClick={() => decide(true)} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CiraPanel() {
  const t = useT();
  const { status, me, autoProvisioning, autoProvisionError, retryProvision, refresh } = useCira();
  const { loading: accountLoading, refreshAccess } = useVayraAccount();
  const { setActive } = useSettingsActiveContext();
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  if (status === "signedOut") {
    return (
      <Section
        title={t("Circle")}
        subtitle={t("Your close circle on VAYRA: friends, invitations, and presence.")}
      >
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-ink">
              {t("Sign in to your VAYRA account")}
            </span>
            <span className="text-[12.5px] text-ink-subtle">
              {t("Rooms, shared collections, and your Circle are tied to your private VAYRA identity.")}
            </span>
          </div>
          <SmallButton label={t("Go to Account")} tone="primary" onClick={() => setActive("account")} />
        </div>
      </Section>
    );
  }

  if (status === "unavailable") {
    return (
      <Section title={t("Circle")} subtitle={t("Your close circle on VAYRA.")}>
        <p className="text-[13px] text-ink-subtle">
          {t("The VAYRA account service isn't configured in this build yet.")}
        </p>
      </Section>
    );
  }

  if (status === "restricted") {
    return (
      <Section title={t("Private beta access")} subtitle={t("Your close circle on VAYRA.")}>
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <p className="text-[13px] text-ink-subtle">
            {t("Rooms and Circle are currently limited to invited beta accounts.")}
          </p>
          <p className="text-[12px] text-ink-subtle">
            {t("Already invited? Refresh your access after the operator enables your account.")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SmallButton
              label={accountLoading ? t("Refreshing…") : t("Refresh beta access")}
              tone="primary"
              disabled={accountLoading}
              onClick={() => {
                setAccessNotice(null);
                void refreshAccess()
                  .then((granted) => {
                    if (!granted) {
                      setAccessNotice(t("Access is not enabled for this account yet."));
                    }
                  })
                  .catch(() => setAccessNotice(t("Access could not be refreshed. Try again.")));
              }}
            />
            {accessNotice ? <InlineNotice text={accessNotice} tone="error" /> : null}
          </div>
        </div>
      </Section>
    );
  }

  if (status === "loading" || (!me && autoProvisioning)) {
    return (
      <Section title={t("Circle")} subtitle={t("Your close circle on VAYRA.")}>
        <p className="text-[13px] text-ink-subtle">
          {autoProvisioning ? t("Setting up your VAYRA identity…") : t("Loading…")}
        </p>
      </Section>
    );
  }

  if (status === "error") {
    return (
      <Section title={t("Circle")} subtitle={t("Your close circle on VAYRA.")}>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <p className="text-[13px] text-ink-subtle">
            {t("Your Circle couldn't be loaded. Your existing data has not been changed.")}
          </p>
          <SmallButton label={t("Try again")} tone="primary" onClick={() => void refresh()} />
        </div>
      </Section>
    );
  }

  if (!me) {
    return (
      <Section title={t("Circle")} subtitle={t("Your close circle on VAYRA.")}>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <p className="text-[13px] text-ink-subtle">
            {autoProvisionError
              ? errorText(t, autoProvisionError)
              : t("Your Circle identity could not be prepared automatically.")}
          </p>
          <SmallButton
            label={t("Try again")}
            tone="primary"
            onClick={() => void retryProvision()}
          />
        </div>
      </Section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <UnifiedIdentityCard />
      <PresenceCard />
      <InviteCard />
      <BlocksCard />
      <PrivateBetaHelpCard />
      <InviteDecisionModal />
    </div>
  );
}
