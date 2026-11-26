import { useState } from "react";
import { Check, Copy, Crown, Link2, LogIn, LogOut, Plus, RadioTower, Trash2, UserPlus, Users } from "lucide-react";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { avatarUrl } from "@/lib/avatars/url";
import { useCira } from "@/lib/cira/provider";
import { copyText } from "@/lib/clipboard";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { VaraError } from "@/lib/vara/errors";
import { useVara } from "@/lib/vara/provider";

function roomErrorText(t: ReturnType<typeof useT>, error: unknown): string {
  const code = error instanceof VaraError ? error.code : "UNKNOWN";
  switch (code) {
    case "VARA_ROOM_FULL":
      return t("This room is full. Ask the host to make room or create another private room.");
    case "VARA_INVITE_UNAVAILABLE":
    case "INVALID_VARA_INVITE":
      return t("This room invitation expired or was revoked.");
    case "VARA_ROOM_UNAVAILABLE":
      return t("This room expired or was closed.");
    case "VARA_SYNC_CONFLICT":
      return t("Leave the current local watch session before entering a room.");
    case "RATE_LIMITED":
      return t("Too many attempts. Wait a moment and try again.");
    case "NETWORK":
      return t("Network error. Check your connection and try again.");
    default:
      return t("Something went wrong. Try again.");
  }
}

export function SalonsTab() {
  const t = useT();
  const { me, relationships } = useCira();
  const {
    repo,
    rooms,
    invitations,
    activeRoom,
    refresh,
    activateRoom,
    leaveActiveRoom,
    closeActiveRoom,
  } = useVara();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const friends = relationships.filter(
    (r) => r.status === "accepted" && Boolean(r.profile.userId),
  );
  const activeMemberIds = new Set(activeRoom?.members.map((m) => m.userId) ?? []);
  const isOwner = Boolean(activeRoom && me && activeRoom.ownerId === me.userId);
  const isHost = Boolean(activeRoom && me && activeRoom.hostId === me.userId);
  const canManage = isOwner || isHost;

  const run = async (action: () => Promise<void>, okText?: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (okText) setNotice({ tone: "ok", text: okText });
    } catch (err) {
      setNotice({ tone: "error", text: roomErrorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  const createAndCopyRoom = async () => {
    if (!repo) return;
    const room = await repo.createRoom();
    activateRoom(room);
    try {
      const link = await repo.createLink(room.id, 1800, 4);
      await copyText(link.url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Room is active even if link generation is skipped.
    }
  };

  const copyRoomLink = async () => {
    if (!repo || !activeRoom) return;
    const link = await repo.createLink(activeRoom.id, 1800, 4);
    await copyText(link.url);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  const otherRooms = rooms.filter((r) => r.id !== activeRoom?.id);

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p className={`text-[13px] ${notice.tone === "error" ? "text-danger" : "text-accent"}`}>
          {notice.text}
        </p>
      )}

      {activeRoom ? (
        <section
          aria-label={t("Active room")}
          className="flex flex-col gap-4 rounded-2xl border border-edge bg-elevated/60 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/10 text-ink ring-1 ring-edge">
                <RadioTower size={18} strokeWidth={2} aria-hidden />
              </span>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                  <h2 className="text-[15px] font-semibold text-ink">{t("Active room")}</h2>
                  <span className="rounded-full bg-canvas/70 px-2 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-edge-soft">
                    {isHost ? t("Sync host") : t("Participant")}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink-subtle">
                  {t("{count} participants · Playback synced without sharing streams.", {
                    count: activeRoom.members.length,
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(copyRoomLink, t("Invite link copied"))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-45"
                >
                  {copiedLink ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {copiedLink ? t("Copied") : t("Copy invite link")}
                </button>
              )}
              {canManage && friends.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setInvitePickerOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-edge-soft bg-canvas/50 px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-edge hover:bg-elevated"
                >
                  <UserPlus size={14} aria-hidden />
                  {t("Invite friend")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => leaveActiveRoom())}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
              >
                <LogOut size={14} aria-hidden />
                {t("Leave")}
              </button>
              {isOwner && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void confirmDialog(t("Close this room for everyone?")).then((ok) => {
                      if (ok) void run(() => closeActiveRoom());
                    });
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-danger/30 px-3 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 size={14} aria-hidden />
                  {t("Close room")}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeRoom.members.map((m) => {
              const memberIsHost = m.userId === activeRoom.hostId;
              return (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 rounded-full border border-edge-soft bg-canvas/55 py-1 pe-3 ps-1.5 text-[12.5px] text-ink"
                >
                  <span className="h-6 w-6 overflow-hidden rounded-full bg-elevated">
                    {m.avatarKey ? (
                      <img src={avatarUrl(m.avatarKey)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <CatAvatar className="h-full w-full" />
                    )}
                  </span>
                  <span className="font-medium">{m.displayName}</span>
                  {memberIsHost && (
                    <Crown size={12} className="text-ink-muted" aria-label={t("Sync host")} />
                  )}
                  {isHost && m.userId !== me?.userId && repo && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await repo.transferHost(activeRoom.id, m.userId);
                          await refresh();
                        }, t("Host transferred"))
                      }
                      className="ms-1 text-[11px] font-medium text-ink-subtle transition-colors hover:text-ink"
                    >
                      {t("Make host")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {invitePickerOpen && repo && (
            <div className="flex flex-col gap-2 rounded-xl border border-edge-soft bg-canvas/60 p-3.5">
              <p className="text-[12px] font-medium text-ink-muted">{t("Invite from your Circle")}</p>
              <div className="flex flex-wrap gap-2">
                {friends
                  .filter((f) => f.profile.userId && !activeMemberIds.has(f.profile.userId))
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (!f.profile.userId) return;
                          await repo.inviteMember(activeRoom.id, f.profile.userId);
                          await refresh();
                        }, t("Invitation sent"))
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-edge-soft bg-elevated/60 px-2.5 text-[12px] font-medium text-ink transition-colors hover:border-edge hover:bg-raised"
                    >
                      <UserPlus size={12} aria-hidden />
                      {f.profile.displayName}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-elevated/45 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold text-ink">{t("Watch together in sync")}</h2>
            <p className="max-w-[54ch] text-[13px] text-ink-muted">
              {t("Create a private room, share a short-lived link or invite your Circle. Everyone plays their own source while playback stays synchronized.")}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !repo}
            onClick={() => void run(createAndCopyRoom, t("Room created and link copied"))}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <Plus size={15} strokeWidth={2.4} aria-hidden />
            {t("New room")}
          </button>
        </section>
      )}

      {invitations.length > 0 && repo && (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Room invitations")}
          </h3>
          <div className="flex flex-col gap-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/45 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-ink-muted">
                    <Users size={15} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {inv.inviter.displayName}
                    </p>
                    <p className="truncate text-[12px] text-ink-subtle">
                      @{inv.inviter.handle} · {t("{count} participants", { count: inv.memberCount })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const joined = await repo.acceptInvitation(inv.id);
                        activateRoom(joined);
                      })
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-45"
                  >
                    <LogIn size={13} aria-hidden />
                    {t("Join")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await repo.declineInvitation(inv.id);
                        await refresh();
                      })
                    }
                    className="inline-flex h-9 items-center rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
                  >
                    {t("Decline")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {otherRooms.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Your open rooms")}
          </h3>
          <div className="flex flex-col gap-2">
            {otherRooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <Link2 size={14} className="text-ink-subtle" aria-hidden />
                  <span className="text-[13.5px] font-medium text-ink">
                    {t("{count} participants", { count: room.members.length })}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => activateRoom(room)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-edge hover:bg-elevated"
                >
                  <LogIn size={13} aria-hidden />
                  {t("Open room")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
