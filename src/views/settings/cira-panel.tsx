import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Copy, Link2, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import { AvatarCatalogModal } from "@/components/avatar-picker/avatar-catalog-modal";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { avatarUrl } from "@/lib/avatars/catalog";
import { useCira } from "@/lib/cira/provider";
import { CiraError } from "@/lib/cira";
import type { CiraInviteSecret, CiraProfile, CiraRelationship } from "@/lib/cira";
import {
  CIRA_INVITATION_CLOCK_MS,
  ciraInvitationMinutesRemaining,
  isActiveCiraInvitation,
} from "@/lib/cira/invitation-lifecycle";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { Section, ToggleRow, useSettingsActiveContext } from "./shared";
import { CiraGroupsCard } from "./cira-groups-card";

function errorText(t: ReturnType<typeof useT>, err: unknown): string {
  const code = err instanceof CiraError ? err.code : "UNKNOWN";
  switch (code) {
    case "NOT_AUTHENTICATED":
      return t("Sign in to your VAYRA account first.");
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
  const [busy, setBusy] = useState<"link" | "request" | "code" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), CIRA_INVITATION_CLOCK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const active = useMemo(
    () => invitations.filter((invitation) => isActiveCiraInvitation(invitation, now)),
    [invitations, now],
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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({
        text: t("Couldn't copy the invitation link. Copy the code instead."),
        tone: "error",
      });
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

  return (
    <Section
      title={t("Invite your CIRA")}
      subtitle={t("Share a short-lived link, add someone by handle, or paste a code you received.")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void createLink()}
              disabled={busy === "link"}
              className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02] disabled:opacity-45"
            >
              <Link2 size={14} />
              {t("Create an invite link")}
            </button>
            <span className="text-[12px] text-ink-subtle">
              {t("Valid 15 minutes, one person, revocable.")}
            </span>
          </div>
          {secret && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-edge bg-elevated px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">
                {secret.url}
              </span>
              <button
                onClick={() => void copyLink()}
                aria-label={t("Copy invite link")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas/40 hover:text-ink"
              >
                {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
              </button>
            </div>
          )}
          {secret && (
            <span className="text-[11.5px] text-ink-subtle">
              {expiresInLabel(t, secret.expiresAt, now)} — {t("the link is shown only once.")}
            </span>
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

        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <input
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendRequest();
              }}
              placeholder={t("Add by handle, e.g. @marie_04")}
              spellCheck={false}
              autoComplete="off"
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
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <input
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && codeDraft.trim()) {
                  const code = codeDraft.trim();
                  if (/^CIRAG/i.test(code.replace(/[^0-9A-Z]/gi, ""))) presentGroupInvite(code);
                  else presentInvite(code);
                  setCodeDraft("");
                }
              }}
              placeholder={t("Paste an invite code")}
              spellCheck={false}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-xl border border-edge bg-elevated px-3 font-mono text-[13px] text-ink placeholder:text-ink-subtle/55 outline-none focus:border-ink"
            />
            <SmallButton
              label={t("Use code")}
              onClick={() => {
                if (!codeDraft.trim()) return;
                const code = codeDraft.trim();
                if (/^CIRAG/i.test(code.replace(/[^0-9A-Z]/gi, ""))) presentGroupInvite(code);
                else presentInvite(code);
                setCodeDraft("");
              }}
              disabled={codeDraft.trim().length === 0}
            />
          </div>
        </div>
        {notice && <InlineNotice text={notice.text} tone={notice.tone} />}
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
                      if (ok) run(repo.blockUser(r.profile.userId));
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
  const { relationships, repo, refresh } = useCira();
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
                        if (ok) run(repo.removeFriend(r.profile.userId));
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
                        if (ok) run(repo.blockUser(r.profile.userId));
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
  const [preview, setPreview] = useState<Pick<CiraProfile, "handle" | "displayName"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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
          <p className="text-[14px] leading-relaxed text-ink-muted">
            {t("{name} (@{handle}) invites you to join their CIRA.", {
              name: preview.displayName,
              handle: preview.handle,
            })}
          </p>
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
  const { setActive } = useSettingsActiveContext();

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
      <ProfileCard />
      {me && (
        <>
          <RequestsCard />
          <InboxCard />
          <FriendsCard />
          <CiraGroupsCard />
          <InviteCard />
          <PresenceCard />
          <BlocksCard />
        </>
      )}
      <InviteDecisionModal />
    </div>
  );
}
