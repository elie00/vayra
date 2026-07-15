import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Camera, ImagePlus, QrCode, Share2, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import QRCode from "qrcode";
import { AvatarCatalogModal } from "@/components/avatar-picker/avatar-catalog-modal";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { avatarUrl } from "@/lib/avatars/catalog";
import { useCira } from "@/lib/cira/provider";
import { CiraError } from "@/lib/cira";
import { CiraQrError, decodeCiraQrFile, parseCiraDiscoverPayload } from "@/lib/cira";
import type { CiraInviteSecret, CiraProfile, CiraRelationship } from "@/lib/cira";
import {
  CIRA_INVITATION_CLOCK_MS,
  ciraInvitationMinutesRemaining,
  isActiveCiraInvitation,
} from "@/lib/cira/invitation-lifecycle";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { isMobileDevice } from "@/lib/platform";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useVayraAccount } from "@/lib/vayra-account";
import { Section, ToggleRow, useSettingsActiveContext } from "./shared";
import { CiraGroupsCard } from "./cira-groups-card";
import { VaraRoomsCard } from "./vara-rooms-card";
import { PrivateBetaGuideCard } from "./private-beta-guide-card";
import { PrivateBetaHelpCard } from "./private-beta-help-card";

function errorText(t: ReturnType<typeof useT>, err: unknown): string {
  const code = err instanceof CiraError ? err.code : "UNKNOWN";
  switch (code) {
    case "NOT_AUTHENTICATED":
      return t("Sign in to your VAYRA account first.");
    case "BETA_ACCESS_REQUIRED":
      return t("CIRA is currently limited to invited beta accounts.");
    case "PROFILE_REQUIRED":
      return t("Choose your CIRA handle first.");
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

function PresenceDot({ presence }: { presence: CiraRelationship["presence"] }) {
  const t = useT();
  if (presence === "online" || presence === "in_vara") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(0,200,140,0.5)]" />
        {presence === "in_vara" ? t("In VARA") : t("Online")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-edge" />
      {presence === "offline" ? t("Offline") : null}
    </span>
  );
}

function PersonRow({
  profile,
  trailing,
  sub,
}: {
  profile: Pick<CiraProfile, "handle" | "displayName"> & { avatarKey?: string | null };
  trailing: React.ReactNode;
  sub?: React.ReactNode;
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
          <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
            @{profile.handle}
            {sub}
          </span>
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
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center rounded-lg px-3 text-[12.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function ProfileCard() {
  const t = useT();
  const { me, repo, refresh } = useCira();
  const [handle, setHandle] = useState(me?.handle ?? "");
  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [avatarKey, setAvatarKey] = useState<string | null>(me?.avatarKey ?? null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  useEffect(() => {
    setHandle(me?.handle ?? "");
    setDisplayName(me?.displayName ?? "");
    setAvatarKey(me?.avatarKey ?? null);
  }, [me]);

  const normalizedHandle = handle.trim().toLowerCase();
  const handleValid = /^[a-z0-9][a-z0-9_]{2,23}$/.test(normalizedHandle);
  const nameValid = displayName.trim().length >= 1 && displayName.trim().length <= 48;
  const dirty =
    normalizedHandle !== (me?.handle ?? "") || displayName.trim() !== (me?.displayName ?? "") ||
    avatarKey !== (me?.avatarKey ?? null);

  const save = async () => {
    if (!repo || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await repo.saveProfile({
        handle: normalizedHandle,
        displayName: displayName.trim(),
        avatarKey,
      });
      await refresh();
      setNotice({ text: t("Saved"), tone: "ok" });
    } catch (err) {
      setNotice({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={t("Your CIRA identity")}
      subtitle={
        me
          ? t("The handle and name your CIRA see. Your handle is how people add you.")
          : t("Pick a unique handle to start connecting with your CIRA — your close circle on VAYRA.")
      }
    >
      <div className="flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setAvatarOpen(true)} className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-elevated ring-2 ring-edge-soft transition hover:ring-ink">
            {avatarKey ? <img src={avatarUrl(avatarKey)} alt="" className="h-full w-full object-cover" /> : <CatAvatar className="h-full w-full" />}
          </button>
          <div>
            <button type="button" onClick={() => setAvatarOpen(true)} className="text-[13px] font-medium text-ink hover:underline">{t("Choose an avatar")}</button>
            <p className="text-[11.5px] text-ink-subtle">{t("Visible only to your CIRA relations and private groups.")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Handle")}
            </label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={t("e.g. marie_04")}
              spellCheck={false}
              autoComplete="off"
              className="h-11 rounded-xl border border-edge bg-elevated px-3 font-mono text-[14px] text-ink placeholder:text-ink-subtle/55 outline-none focus:border-ink"
            />
            {handle.length > 0 && !handleValid && (
              <span className="text-[11.5px] text-ink-subtle">
                {t("3-24 characters: lowercase letters, digits, underscore.")}
              </span>
            )}
          </div>
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Display name")}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("How your CIRA see you")}
              autoComplete="off"
              className="h-11 rounded-xl border border-edge bg-elevated px-3 text-[14px] text-ink placeholder:text-ink-subtle/55 outline-none focus:border-ink"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SmallButton
            label={busy ? t("Saving…") : me ? t("Save") : t("Create profile")}
            tone="primary"
            onClick={() => void save()}
            disabled={!handleValid || !nameValid || !dirty || busy}
          />
          {notice && <InlineNotice text={notice.text} tone={notice.tone} />}
        </div>
        {avatarOpen && (
          <AvatarCatalogModal
            current={avatarKey ? avatarUrl(avatarKey) : null}
            onPick={(id) => { setAvatarKey(id); setAvatarOpen(false); }}
            onClose={() => setAvatarOpen(false)}
          />
        )}
      </div>
    </Section>
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
      subtitle={t("When enabled, your accepted CIRA see whether you're online or in a VARA room. Off by default; turning it off wipes your presence immediately.")}
    >
      <ToggleRow
        label={t("Share my presence with my CIRA")}
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

function InboxCard() {
  const t = useT();
  const { inbox, repo, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  if (!repo || !inbox || (inbox.friendRequestCount === 0 && inbox.groupInvitationCount === 0)) return null;
  return (
    <Section title={t("CIRA inbox")} subtitle={t("Pending social actions, synchronized across your devices without keeping an activity history.")}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-ink-muted">
            <Bell size={16} />
            {inbox.unreadCount > 0 && <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-ink px-1 text-center text-[10px] font-semibold leading-5 text-canvas">{inbox.unreadCount}</span>}
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink">{t("{requests} requests · {groups} group invitations", { requests: inbox.friendRequestCount, groups: inbox.groupInvitationCount })}</p>
            <p className="text-[11.5px] text-ink-subtle">{inbox.unreadCount > 0 ? t("{count} new", { count: inbox.unreadCount }) : t("Everything here has been seen")}</p>
          </div>
        </div>
        {inbox.unreadCount > 0 && <SmallButton label={t("Mark as seen")} onClick={() => {
          setError(null);
          void repo.markInboxSeen().then(refresh).catch((cause) => setError(errorText(t, cause)));
        }} />}
      </div>
      {error && <InlineNotice text={error} tone="error" />}
    </Section>
  );
}

function expiresInLabel(t: ReturnType<typeof useT>, expiresAt: string, now: number): string {
  const minutes = ciraInvitationMinutesRemaining(expiresAt, now);
  return t("Expires in {minutes} min", { minutes });
}

function InviteCard() {
  const t = useT();
  const { repo, refresh, invitations, presentInvite, presentGroupInvite } = useCira();
  const [secret, setSecret] = useState<CiraInviteSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [busy, setBusy] = useState<"link" | "request" | "scan" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mobile = isMobileDevice();
  const qrErrorText = t("The QR code couldn't be generated. Copy the link instead.");
  const hasTimedInvitation = Boolean(secret) || invitations.some((invitation) =>
    isActiveCiraInvitation(invitation, Date.now()),
  );

  useEffect(() => {
    if (!hasTimedInvitation) return;
    const interval = window.setInterval(() => setNow(Date.now()), CIRA_INVITATION_CLOCK_MS);
    return () => window.clearInterval(interval);
  }, [hasTimedInvitation]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (secret && Date.parse(secret.expiresAt) <= now) setSecret(null);
  }, [secret, now]);

  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!secret || !canvas) return;
    let active = true;
    void QRCode.toCanvas(canvas, secret.url, {
      width: 264,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#0B0C10", light: "#F5F3EE" },
    }).catch(() => {
      if (active) setNotice({ text: qrErrorText, tone: "error" });
    });
    return () => {
      active = false;
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [secret, qrErrorText]);

  const active = useMemo(
    () => invitations.filter((invitation) => invitation.id !== secret?.invitationId && isActiveCiraInvitation(invitation, now)),
    [invitations, now, secret?.invitationId],
  );

  if (!repo) return null;

  const createLink = async () => {
    setBusy("link");
    setNotice(null);
    try {
      const s = await repo.createInvitation();
      setSecret(s);
      setCopied(false);
      await refresh();
    } catch (err) {
      setNotice({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!secret) return;
    setNotice(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(secret.url);
      setCopied(true);
    } catch {
      setNotice({
        text: t("Couldn't copy the invitation link. Copy the code instead."),
        tone: "error",
      });
    }
  };

  const shareLink = async () => {
    if (!secret) return;
    if (!navigator.share) {
      await copyLink();
      return;
    }
    setNotice(null);
    try {
      await navigator.share({ title: t("CIRA invitation"), text: t("Join my private CIRA on VAYRA."), url: secret.url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({ text: t("Couldn't share the invitation. Copy the link instead."), tone: "error" });
    }
  };

  const sendRequest = async () => {
    const target = handleDraft.trim().toLowerCase().replace(/^@/, "");
    if (!target) return;
    setBusy("request");
    setNotice(null);
    try {
      await repo.sendRequest(target);
      setHandleDraft("");
      await refresh();
      setNotice({
        text: t("If the handle can receive requests, the request was sent."),
        tone: "ok",
      });
    } catch (err) {
      setNotice({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const submitInvitationInput = (value: string) => {
    const compact = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (compact.startsWith("CIRAG")) {
      presentGroupInvite(value);
      setCodeDraft("");
      return;
    }
    const payload = parseCiraDiscoverPayload(value);
    if (!payload) {
      setNotice({ text: t("This QR code or invitation link isn't a valid private CIRA invitation."), tone: "error" });
      return;
    }
    setNotice(null);
    presentInvite(payload.code);
    setCodeDraft("");
  };

  const scanImage = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy("scan");
    setNotice(null);
    try {
      const payload = await decodeCiraQrFile(file);
      presentInvite(payload.code);
    } catch (error) {
      const key = error instanceof CiraQrError ? error.code : "QR_PAYLOAD_UNAVAILABLE";
      const text = key === "IMAGE_TOO_LARGE"
        ? t("This image is too large to scan safely.")
        : key === "IMAGE_TYPE_UNSUPPORTED"
          ? t("Choose a PNG, JPEG, or WebP image.")
          : t("No valid private CIRA QR code was found in this image.");
      setNotice({ text, tone: "error" });
    } finally {
      setBusy(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  return (
    <Section
      title={t("CIRA Discover")}
      subtitle={t("Connect intentionally by exact handle or a private, short-lived QR invitation. Nothing is public or suggested.")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-ink">{t("My temporary CIRA QR")}</p>
              <p className="text-[11.5px] text-ink-subtle">{t("It contains only an opaque invitation link — never your profile or activity.")}</p>
            </div>
            <button
              onClick={() => void createLink()}
              disabled={busy === "link"}
              className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02] disabled:opacity-45"
            >
              <QrCode size={14} />
              {t("Create private QR")}
            </button>
          </div>
          {secret && (
            <div className="grid gap-4 rounded-2xl border border-edge bg-elevated p-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <canvas ref={qrCanvasRef} role="img" aria-label={t("Temporary private CIRA invitation QR code")} className="mx-auto h-52 w-52 rounded-xl bg-[#F5F3EE]" />
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  {t("Show this QR only to the person you want to add. The first decision consumes it.")}
                </p>
                <code className="break-all rounded-lg border border-edge-soft bg-canvas/50 p-2 text-[11px] text-ink-subtle">{secret.code}</code>
                <div className="flex flex-wrap gap-2">
                  <SmallButton label={copied ? t("Copied") : t("Copy link")} onClick={() => void copyLink()} />
                  <button type="button" onClick={() => void shareLink()} className="flex h-9 items-center gap-2 rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink">
                    <Share2 size={13} /> {t("Share")}
                  </button>
                  <SmallButton
                    label={t("Revoke")}
                    tone="danger"
                    onClick={() => void repo.revokeInvitation(secret.invitationId).then(async () => { setSecret(null); await refresh(); }).catch((error) => setNotice({ text: errorText(t, error), tone: "error" }))}
                  />
                </div>
                <span className="text-[11.5px] text-ink-subtle">
                  {expiresInLabel(t, secret.expiresAt, now)} — {t("one person, one decision, revocable.")}
                </span>
              </div>
            </div>
          )}
          {active.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-edge-soft/60 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                {t("Active invitations")}
              </span>
              {active.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink-muted">
                    {expiresInLabel(t, inv.expiresAt, now)}
                  </span>
                  <SmallButton
                    label={t("Revoke")}
                    tone="danger"
                    onClick={() => {
                      void repo
                        .revokeInvitation(inv.id)
                        .then(refresh)
                        .catch((err) => setNotice({ text: errorText(t, err), tone: "error" }));
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
            <div>
              <p className="text-[13px] font-medium text-ink">{t("Add by exact handle")}</p>
              <p className="text-[11.5px] text-ink-subtle">{t("No profile preview or public search. The same private receipt is shown whether the handle can receive requests or not.")}</p>
            </div>
            <div className="flex items-center gap-2">
            <input
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendRequest();
              }}
              placeholder={t("Add by handle, e.g. @marie_04")}
              maxLength={25}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              className="h-10 min-w-0 flex-1 rounded-xl border border-edge bg-elevated px-3 font-mono text-[13px] text-ink placeholder:text-ink-subtle/55 outline-none focus:border-ink"
            />
            <button
              onClick={() => void sendRequest()}
              disabled={busy === "request" || handleDraft.trim().length === 0}
              aria-label={t("Send friend request")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft text-ink-muted transition-colors hover:border-edge hover:text-ink disabled:opacity-45"
            >
              <UserPlus size={15} />
            </button>
            </div>
            <p className="text-[11px] text-ink-subtle">{t("If delivered, the recipient will see only your minimal CIRA profile before deciding.")}</p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
            <div>
              <p className="text-[13px] font-medium text-ink">{t("Scan or import a private QR")}</p>
              <p className="text-[11.5px] text-ink-subtle">{t("Images are decoded only on this device and are never uploaded.")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mobile && (
                <button type="button" disabled={busy === "scan"} onClick={() => cameraInputRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted hover:border-edge hover:text-ink disabled:opacity-45">
                  <Camera size={14} /> {t("Take a QR photo")}
                </button>
              )}
              <button type="button" disabled={busy === "scan"} onClick={() => imageInputRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted hover:border-edge hover:text-ink disabled:opacity-45">
                <ImagePlus size={14} /> {busy === "scan" ? t("Scanning…") : t("Choose QR image")}
              </button>
            </div>
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("Choose a QR code image")} onChange={(event) => void scanImage(event.target.files?.[0])} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t("Take a QR code photo")} onChange={(event) => void scanImage(event.target.files?.[0])} />
            <div className="flex items-center gap-2">
              <input
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && codeDraft.trim()) submitInvitationInput(codeDraft); }}
                placeholder={t("Paste a CIRA link or code")}
                maxLength={256}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                className="h-10 min-w-0 flex-1 rounded-xl border border-edge bg-elevated px-3 font-mono text-[13px] text-ink placeholder:text-ink-subtle/55 outline-none focus:border-ink"
              />
              <SmallButton label={t("Preview")} onClick={() => submitInvitationInput(codeDraft)} disabled={!codeDraft.trim()} />
            </div>
          </div>
        </div>
        <div aria-live="polite">{notice && <InlineNotice text={notice.text} tone={notice.tone} />}</div>
      </div>
    </Section>
  );
}

function RequestsCard() {
  const t = useT();
  const { relationships, repo, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  const incoming = relationships.filter((r) => r.direction === "incoming");
  const outgoing = relationships.filter((r) => r.direction === "outgoing");
  if (!repo || (incoming.length === 0 && outgoing.length === 0)) return null;

  const run = (action: Promise<void>) => {
    setError(null);
    void action.then(refresh).catch((err) => setError(errorText(t, err)));
  };

  return (
    <Section title={t("Requests")} subtitle={t("Pending friend requests, both directions.")}>
      <div className="flex flex-col gap-2">
        {incoming.map((r) => (
          <PersonRow
            key={r.id}
            profile={r.profile}
            sub={<span className="text-ink-subtle">{t("wants to join your CIRA")}</span>}
            trailing={
              <>
                <SmallButton
                  label={t("Accept")}
                  tone="primary"
                  onClick={() => run(repo.acceptRequest(r.id))}
                />
                <SmallButton
                  label={t("Decline")}
                  tone="danger"
                  onClick={() => run(repo.declineRequest(r.id))}
                />
                <button
                  onClick={() => {
                    void confirmDialog(
                      t("Block {name}? They won't be able to contact you again.", {
                        name: r.profile.displayName,
                      }),
                    ).then((ok) => {
                      if (ok && r.profile.userId) run(repo.blockUser(r.profile.userId));
                    });
                  }}
                  aria-label={t("Block user")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge-soft text-ink-subtle transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <ShieldOff size={14} />
                </button>
              </>
            }
          />
        ))}
        {outgoing.map((r) => (
          <PersonRow
            key={r.id}
            profile={r.profile}
            sub={<span className="text-ink-subtle">{t("request sent")}</span>}
            trailing={
              <SmallButton label={t("Cancel")} onClick={() => run(repo.cancelRequest(r.id))} />
            }
          />
        ))}
        {error && <InlineNotice text={error} tone="error" />}
      </div>
    </Section>
  );
}

function FriendsCard() {
  const t = useT();
  const { relationships, relationshipsHasMore, loadMoreRelationships, repo, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  const friends = relationships.filter((r) => r.status === "accepted");
  if (!repo) return null;

  const run = (action: Promise<void>) => {
    setError(null);
    void action.then(refresh).catch((err) => setError(errorText(t, err)));
  };

  return (
    <Section
      title={t("Your CIRA")}
      subtitle={t("The people in your circle. Presence only shows for friends who share it.")}
    >
      {friends.length === 0 ? (
        <p className="text-[13px] text-ink-subtle">
          {t("No one yet. Send an invite link to bring in your first CIRA.")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {friends.map((r) => (
            <PersonRow
              key={r.id}
              profile={r.profile}
              sub={<PresenceDot presence={r.presence} />}
              trailing={
                <>
                  <button
                    onClick={() => {
                      void confirmDialog(
                        t("Remove {name} from your CIRA?", { name: r.profile.displayName }),
                      ).then((ok) => {
                        if (ok && r.profile.userId) run(repo.removeFriend(r.profile.userId));
                      });
                    }}
                    aria-label={t("Remove friend")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge-soft text-ink-subtle transition-colors hover:border-edge hover:text-ink"
                  >
                    <UserMinus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      void confirmDialog(
                        t("Block {name}? They won't be able to contact you again.", {
                          name: r.profile.displayName,
                        }),
                      ).then((ok) => {
                        if (ok && r.profile.userId) run(repo.blockUser(r.profile.userId));
                      });
                    }}
                    aria-label={t("Block user")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge-soft text-ink-subtle transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    <ShieldOff size={14} />
                  </button>
                </>
              }
            />
          ))}
          {error && <InlineNotice text={error} tone="error" />}
        </div>
      )}
      {relationshipsHasMore && (
        <SmallButton
          label={t("Load more CIRA")}
          onClick={() => void loadMoreRelationships().catch((cause) => setError(errorText(t, cause)))}
        />
      )}
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
          <h3 id="cira-invitation-title" className="font-display text-[18px] font-medium text-ink">{t("CIRA invitation")}</h3>
          <button
            onClick={clearPendingInvite}
            aria-label={t("Close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas/40 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        {error ? (
          <InlineNotice text={error} tone="error" />
        ) : preview ? (
          <div className="flex items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-4">
            <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-elevated ring-1 ring-edge-soft">
              {preview.avatarKey ? <img src={avatarUrl(preview.avatarKey)} alt="" className="h-full w-full object-cover" /> : <CatAvatar className="h-full w-full" />}
            </span>
            <p className="text-[14px] leading-relaxed text-ink-muted">
              {t("{name} (@{handle}) invites you to join their CIRA.", {
                name: preview.displayName,
                handle: preview.handle,
              })}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-subtle">{t("Checking the invitation…")}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <SmallButton
            label={t("Decline")}
            tone="danger"
            onClick={() => decide(false)}
            disabled={busy || !preview}
          />
          <SmallButton
            label={t("Accept")}
            tone="primary"
            onClick={() => decide(true)}
            disabled={busy || !preview}
          />
        </div>
      </div>
    </div>
  );
}

export function CiraPanel() {
  const t = useT();
  const { status, me, refresh } = useCira();
  const { loading: accountLoading, refreshAccess } = useVayraAccount();
  const { setActive } = useSettingsActiveContext();
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  if (status === "signedOut") {
    return (
      <Section
        title={t("CIRA")}
        subtitle={t("Your close circle on VAYRA: friends, invitations, and presence.")}
      >
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-ink">
              {t("Sign in to your VAYRA account")}
            </span>
            <span className="text-[12.5px] text-ink-subtle">
              {t("CIRA is tied to your private VAYRA identity.")}
            </span>
          </div>
          <SmallButton label={t("Go to Account")} tone="primary" onClick={() => setActive("account")} />
        </div>
      </Section>
    );
  }

  if (status === "unavailable") {
    return (
      <Section title={t("CIRA")} subtitle={t("Your close circle on VAYRA.")}>
        <p className="text-[13px] text-ink-subtle">
          {t("The VAYRA account service isn't configured in this build yet.")}
        </p>
      </Section>
    );
  }

  if (status === "restricted") {
    return (
      <Section title={t("CIRA private beta")} subtitle={t("Your close circle on VAYRA.")}>
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <p className="text-[13px] text-ink-subtle">
            {t("CIRA is currently limited to invited beta accounts.")}
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

  if (status === "loading") {
    return (
      <Section title={t("CIRA")} subtitle={t("Your close circle on VAYRA.")}>
        <p className="text-[13px] text-ink-subtle">{t("Loading…")}</p>
      </Section>
    );
  }

  if (status === "error") {
    return (
      <Section title={t("CIRA unavailable")} subtitle={t("Your close circle on VAYRA.")}>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <p className="text-[13px] text-ink-subtle">
            {t("CIRA couldn't be loaded. Your existing data has not been changed.")}
          </p>
          <SmallButton label={t("Try again")} tone="primary" onClick={() => void refresh()} />
        </div>
      </Section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PrivateBetaGuideCard />
      <ProfileCard />
      {me && (
        <>
          <RequestsCard />
          <InboxCard />
          <FriendsCard />
          <CiraGroupsCard />
          <VaraRoomsCard />
          <PrivateBetaHelpCard />
          <InviteCard />
          <PresenceCard />
          <BlocksCard />
        </>
      )}
      <InviteDecisionModal />
    </div>
  );
}
