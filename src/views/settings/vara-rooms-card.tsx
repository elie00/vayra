import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Crown, Link2, LogIn, LogOut, Plus, RadioTower, Trash2, UserPlus, X } from "lucide-react";
import { useCira } from "@/lib/cira/provider";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { VaraError } from "@/lib/vara/errors";
import { useVara } from "@/lib/vara/provider";
import type { VaraRoomLink, VaraRoomLinkPreview, VaraRoomLinkSecret } from "@/lib/vara/types";
import { Section } from "./shared";

function varaErrorText(t: ReturnType<typeof useT>, error: unknown): string {
  const code = error instanceof VaraError ? error.code : "UNKNOWN";
  switch (code) {
    case "NOT_AUTHENTICATED":
      return t("Sign in to your VAYRA account first.");
    case "BETA_ACCESS_REQUIRED":
      return t("CIRA is currently limited to invited beta accounts.");
    case "PROFILE_REQUIRED":
      return t("Choose your CIRA handle first.");
    case "VARA_ROOM_FULL":
      return t("This VARA is full. Ask the host to make room or create another private room.");
    case "VARA_INVITE_UNAVAILABLE":
    case "INVALID_VARA_INVITE":
      return t("This VARA invitation expired or was revoked. Ask for a fresh short-lived link.");
    case "VARA_ROOM_UNAVAILABLE":
      return t("This VARA expired or was closed. Ask an accepted relation to create a new room.");
    case "VARA_ROOM_FORBIDDEN":
      return t("You no longer have access to this VARA. Return to CIRA; VAYRA does not reveal whether a block or removal caused it.");
    case "VARA_NOT_HOST":
      return t("Only the current VEYA host can do that. Ask the host to transfer control first.");
    case "VARA_HOST_LEASE_ACTIVE":
      return t("Another VEYA host is still active. Wait briefly or ask them to transfer control.");
    case "VARA_HOST_TRANSFER_UNAVAILABLE":
      return t("Host transfer is no longer available. Refresh the room and choose an active member.");
    case "VARA_SYNC_CONFLICT":
      return t("Leave the current local watch session before entering a remote VARA, then try again.");
    case "GROUP_ARCHIVED":
      return t("This group is archived. Ask an owner or admin to restore it, or create a direct VARA.");
    case "RATE_LIMITED":
      return t("Too many attempts. Wait a moment and try again.");
    case "NETWORK":
      return t("Network error. Check your connection and try again.");
    default:
      return t("Something went wrong. Try again.");
  }
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  icon?: typeof Plus;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "bg-ink text-canvas hover:opacity-90"
          : "border border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
      }`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </button>
  );
}

export function VaraRoomsCard() {
  const t = useT();
  const { me, relationships } = useCira();
  const {
    status,
    repo,
    rooms,
    invitations,
    activeRoom,
    pendingLinkCode,
    syncConflict,
    refresh,
    activateRoom,
    leaveActiveRoom,
    closeActiveRoom,
    clearPendingLink,
  } = useVara();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [secret, setSecret] = useState<VaraRoomLinkSecret | null>(null);
  const [preview, setPreview] = useState<VaraRoomLinkPreview | null>(null);
  const [links, setLinks] = useState<VaraRoomLink[]>([]);

  const friends = useMemo(() => relationships.filter(
    (relationship) => relationship.status === "accepted" && relationship.profile.userId,
  ), [relationships]);
  const activeMemberIds = new Set(activeRoom?.members.map((member) => member.userId) ?? []);
  const canManageActive = !!activeRoom && !!me && (
    activeRoom.ownerId === me.userId || activeRoom.hostId === me.userId
  );
  const isActiveOwner = activeRoom?.ownerId === me?.userId;
  const isActiveHost = activeRoom?.hostId === me?.userId;

  const refreshLinks = useCallback(async () => {
    if (!repo || !activeRoom || !canManageActive) {
      setLinks([]);
      return;
    }
    setLinks(await repo.listLinks(activeRoom.id));
  }, [repo, activeRoom, canManageActive]);

  useEffect(() => {
    void refreshLinks().catch(() => setLinks([]));
  }, [refreshLinks]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!pendingLinkCode || !repo) return;
    void repo.previewLink(pendingLinkCode).then((next) => {
      if (!cancelled) setPreview(next);
    }).catch((error) => {
      if (!cancelled) setNotice({ tone: "error", text: varaErrorText(t, error) });
    });
    return () => {
      cancelled = true;
    };
  }, [pendingLinkCode, repo, t]);

  const run = async (action: () => Promise<void>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "ok", text: success });
    } catch (error) {
      setNotice({ tone: "error", text: varaErrorText(t, error) });
    } finally {
      setBusy(false);
    }
  };

  const createRoom = () => run(async () => {
    if (!repo) return;
    if (syncConflict) throw new VaraError("VARA_SYNC_CONFLICT");
    const room = await repo.createRoom(4 * 60 * 60, 8);
    activateRoom(room);
    await refresh();
  }, t("Private VARA created."));

  const createLink = () => run(async () => {
    if (!repo || !activeRoom) return;
    const next = await repo.createLink(activeRoom.id, 900, 1);
    setSecret(next);
    await refreshLinks();
  }, t("Short-lived invitation created."));

  const acceptLink = () => run(async () => {
    if (!repo || !pendingLinkCode) return;
    if (syncConflict) throw new VaraError("VARA_SYNC_CONFLICT");
    const room = await repo.acceptLink(pendingLinkCode);
    clearPendingLink();
    setPreview(null);
    activateRoom(room);
    await refresh();
  }, t("You joined the private VARA."));

  const incomingInvitations = invitations.filter((invite) => invite.direction === "incoming");
  const outgoingInvitations = invitations.filter((invite) => invite.direction === "outgoing");

  if (status === "loading") {
    return <Section title={t("Private VARA rooms")}><p className="text-[13px] text-ink-subtle">{t("Loading…")}</p></Section>;
  }
  if (status !== "ready" || !repo) return null;

  return (
    <Section
      title={t("Private VARA rooms")}
      subtitle={t("Watch together with your CIRA through private, synchronized rooms.")}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-edge-soft bg-elevated/55 p-4" role="note">
          <p className="text-[13.5px] font-medium text-ink">{t("Before entering a Watch Room")}</p>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
            {t("Each participant opens their own content locally. VAYRA never shares the stream, source or addon; VEYA synchronizes only play, pause and seeking.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-soft bg-canvas/40 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-elevated text-ink">
              <RadioTower className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium text-ink">
                {activeRoom ? t("VARA active") : t("No active VARA")}
              </span>
              <span className="text-[12px] text-ink-subtle">
                {activeRoom
                  ? t("{n} active participant(s)", { n: activeRoom.members.length })
                  : t("Create a private room or accept an invitation.")}
              </span>
            </div>
          </div>
          {activeRoom ? (
            <ActionButton
              label={isActiveOwner ? t("Close VARA") : t("Leave VARA")}
              icon={isActiveOwner ? Trash2 : LogOut}
              disabled={busy}
              onClick={() => void confirmDialog(
                isActiveOwner
                  ? t("Close this VARA for every member?")
                  : t("Leave this private VARA?"),
              ).then((confirmed) => {
                if (!confirmed) return;
                void run(() => isActiveOwner ? closeActiveRoom() : leaveActiveRoom());
              })}
            />
          ) : (
            <ActionButton
              label={t("Create VARA")}
              icon={Plus}
              primary
              disabled={busy}
              onClick={() => void createRoom()}
            />
          )}
        </div>

        {rooms.length > 0 ? (
          <div className="grid gap-2">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {room.ownerId === me?.userId ? t("Your private VARA") : t("Private VARA")}
                  </p>
                  <p className="text-[11.5px] text-ink-subtle">
                    {t("{n} member(s) · expires {date}", {
                      n: room.members.length,
                      date: new Date(room.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    })}
                  </p>
                </div>
                {activeRoom?.id === room.id ? (
                  <span className="text-[11.5px] font-medium text-accent">{t("Active")}</span>
                ) : (
                  <ActionButton label={t("Enter")} icon={LogIn} disabled={busy} onClick={() => void run(async () => {
                    activateRoom(room);
                  })} />
                )}
              </div>
            ))}
          </div>
        ) : null}

        {incomingInvitations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("VARA invitations")}</p>
            {incomingInvitations.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{invite.inviter.displayName}</p>
                  <p className="text-[11.5px] text-ink-subtle">@{invite.inviter.handle} · {invite.memberCount} {t("members")}</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton label={t("Decline")} icon={X} disabled={busy} onClick={() => void run(async () => {
                    await repo.declineInvitation(invite.id);
                    await refresh();
                  })} />
                  <ActionButton label={t("Accept")} icon={Check} primary disabled={busy} onClick={() => void run(async () => {
                    if (syncConflict) throw new VaraError("VARA_SYNC_CONFLICT");
                    const room = await repo.acceptInvitation(invite.id);
                    activateRoom(room);
                    await refresh();
                  }, t("You joined the private VARA."))} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {outgoingInvitations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("Sent VARA invitations")}</p>
            {outgoingInvitations.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{invite.invitee.displayName}</p>
                  <p className="text-[11.5px] text-ink-subtle">@{invite.invitee.handle}</p>
                </div>
                <ActionButton label={t("Cancel invitation")} icon={X} disabled={busy} onClick={() => void run(async () => {
                  await repo.cancelInvitation(invite.id);
                  await refresh();
                })} />
              </div>
            ))}
          </div>
        ) : null}

        {activeRoom && canManageActive ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-canvas/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-medium text-ink">{t("Invite your CIRA")}</p>
                <p className="text-[11.5px] text-ink-subtle">{t("Only accepted CIRA relationships can join.")}</p>
              </div>
              <ActionButton label={t("Create private link")} icon={Link2} disabled={busy} onClick={() => void createLink()} />
            </div>
            <div className="flex flex-wrap gap-2">
              {friends.filter((friend) => !activeMemberIds.has(friend.profile.userId!)).map((friend) => (
                <ActionButton
                  key={friend.id}
                  label={friend.profile.displayName}
                  icon={UserPlus}
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await repo.inviteMember(activeRoom.id, friend.profile.userId!);
                    await refresh();
                  }, t("VARA invitation sent."))}
                />
              ))}
            </div>
            {secret ? (
              <div className="flex items-center gap-2 rounded-xl border border-edge-soft bg-elevated/50 p-3">
                <code className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">{secret.url}</code>
                <ActionButton label={t("Copy")} icon={Copy} onClick={() => void navigator.clipboard.writeText(secret.url)} />
              </div>
            ) : null}
            {links.length > 0 ? (
              <div className="grid gap-2 border-t border-edge-soft pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("Active private links")}</p>
                {links.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft px-3 py-2.5">
                    <p className="text-[11.5px] text-ink-subtle">
                      {t("{used} of {max} uses · expires {date}", {
                        used: link.useCount,
                        max: link.maxUses,
                        date: new Date(link.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      })}
                    </p>
                    <ActionButton label={t("Revoke")} icon={Trash2} disabled={busy} onClick={() => void run(async () => {
                      await repo.revokeLink(link.id);
                      await refreshLinks();
                    })} />
                  </div>
                ))}
              </div>
            ) : null}
            {isActiveHost && activeRoom.members.length > 1 ? (
              <div className="grid gap-2 border-t border-edge-soft pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("Transfer VEYA host")}</p>
                <div className="flex flex-wrap gap-2">
                  {activeRoom.members.filter((member) => member.userId !== me?.userId).map((member) => (
                    <ActionButton key={member.userId} label={member.displayName} icon={Crown} disabled={busy} onClick={() => void confirmDialog(
                      t("Transfer VEYA host to {name}?", { name: member.displayName }),
                    ).then((confirmed) => {
                      if (!confirmed) return;
                      void run(async () => {
                        const room = await repo.transferHost(activeRoom.id, member.userId);
                        activateRoom(room);
                        await refresh();
                      }, t("VEYA host transferred."));
                    })} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {pendingLinkCode ? (
          <div className="rounded-2xl border border-edge-soft bg-elevated/40 p-4">
            <p className="text-[14px] font-medium text-ink">{t("Private VARA invitation")}</p>
            <p className="mt-1 text-[12.5px] text-ink-subtle">
              {preview
                ? t("{name} invited you to a private VARA with {n} member(s).", {
                    name: preview.creatorDisplayName,
                    n: preview.memberCount,
                  })
                : t("Checking the invitation…")}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <ActionButton label={t("Cancel")} icon={X} onClick={() => {
                clearPendingLink();
                setPreview(null);
              }} />
              <ActionButton label={t("Join VARA")} icon={LogIn} primary disabled={!preview || busy} onClick={() => void acceptLink()} />
            </div>
          </div>
        ) : null}

        {notice ? (
          <p className={`text-[12.5px] ${notice.tone === "error" ? "text-danger" : "text-accent"}`}>{notice.text}</p>
        ) : null}
      </div>
    </Section>
  );
}
