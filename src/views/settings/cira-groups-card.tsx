import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, Copy, Crown, Link2, Plus, Settings2, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
import { CiraError } from "@/lib/cira";
import { useCira } from "@/lib/cira/provider";
import type { CiraGroup, CiraGroupLink, CiraGroupLinkPreview, CiraGroupMember } from "@/lib/cira";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { GroupCollections } from "./cira-collections";
import { Section } from "./shared";

function groupError(t: ReturnType<typeof useT>, error: unknown): string {
  const code = error instanceof CiraError ? error.code : "UNKNOWN";
  const messages: Partial<Record<CiraError["code"], string>> = {
    INVALID_GROUP: t("Check the group name, description and member limit."),
    GROUP_NOT_FOUND: t("This private group is no longer available."),
    GROUP_FORBIDDEN: t("You don't have permission to do that in this group."),
    GROUP_CAP_TOO_SMALL: t("The member limit can't be lower than the current member count."),
    GROUP_FULL: t("This group has reached its member limit."),
    GROUP_MEMBER_NOT_FOUND: t("This member is no longer in the group."),
    INVALID_GROUP_ROLE: t("That role isn't available."),
    GROUP_OWNER_MUST_TRANSFER: t("Transfer ownership before leaving the group."),
    GROUP_INVITE_UNAVAILABLE: t("This group invitation is no longer available."),
    ALREADY_GROUP_MEMBER: t("This person is already in the group."),
    INVALID_GROUP_INVITE: t("Choose a link duration between 5 minutes and 24 hours."),
    GROUP_BLOCK_CONFLICT: t("A blocked person is already in this group."),
    GROUP_ARCHIVED: t("This group is archived. Restore it to make changes."),
    INVALID_BULK_INVITE: t("Select between 1 and 50 people to invite."),
    RATE_LIMITED: t("Too many attempts. Wait a moment and try again."),
    NETWORK: t("Network error. Check your connection and try again."),
  };
  return messages[code] ?? t("Something went wrong. Try again.");
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        danger
          ? "border-danger/25 text-danger hover:bg-danger/10"
          : "border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function GroupForm({ group, onDone }: { group?: CiraGroup; onDone: () => void }) {
  const t = useT();
  const { repo, refresh } = useCira();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [maxMembers, setMaxMembers] = useState(group?.maxMembers ?? 100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!repo) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        avatarKey: group?.avatarKey ?? null,
        maxMembers,
      };
      if (group) await repo.updateGroup(group.id, input);
      else await repo.createGroup(input);
      await refresh();
      onDone();
    } catch (cause) {
      setError(groupError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-canvas/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
          {t("Group name")}
          <input
            value={name}
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
          {t("Member limit")}
          <input
            type="number"
            min={Math.max(2, group?.memberCount ?? 2)}
            max={250}
            value={maxMembers}
            onChange={(event) => setMaxMembers(Number(event.target.value))}
            className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {t("Private description")}
        <textarea
          value={description}
          maxLength={240}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          className="resize-none rounded-lg border border-edge bg-elevated p-3 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <ActionButton onClick={onDone}>{t("Cancel")}</ActionButton>
        <button
          onClick={() => void save()}
          disabled={busy || !name.trim() || maxMembers < 2 || maxMembers > 250}
          className="h-9 rounded-lg bg-ink px-4 text-[12px] font-semibold text-canvas disabled:opacity-45"
        >
          {busy ? t("Saving…") : group ? t("Save") : t("Create group")}
        </button>
      </div>
    </div>
  );
}

function GroupInvitations() {
  const t = useT();
  const { repo, groupInvitations, refresh } = useCira();
  const [error, setError] = useState<string | null>(null);
  if (!repo || groupInvitations.length === 0) return null;
  const run = async (action: Promise<void>) => {
    setError(null);
    try {
      await action;
      await refresh();
    } catch (cause) {
      setError(groupError(t, cause));
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-edge-soft bg-canvas/30 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("Group invitations")}
      </span>
      {groupInvitations.map((invitation) => (
        <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge-soft bg-elevated/60 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{invitation.groupName}</p>
            <p className="truncate text-[11.5px] text-ink-subtle">
              {invitation.direction === "incoming"
                ? t("Invited by {name}", { name: invitation.inviter.displayName })
                : t("Invited {name}", { name: invitation.invitee.displayName })}
            </p>
          </div>
          <div className="flex gap-2">
            {invitation.direction === "incoming" ? (
              <>
                <ActionButton onClick={() => void run(repo.declineGroupInvitation(invitation.id))} danger>
                  {t("Decline")}
                </ActionButton>
                <button onClick={() => void run(repo.acceptGroupInvitation(invitation.id))} className="h-9 rounded-lg bg-ink px-3 text-[12px] font-semibold text-canvas">
                  {t("Accept")}
                </button>
              </>
            ) : (
              <ActionButton onClick={() => void run(repo.cancelGroupInvitation(invitation.id))} danger>
                {t("Cancel")}
              </ActionButton>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function GroupLinkDecision() {
  const t = useT();
  const { repo, pendingGroupInviteCode, clearPendingGroupInvite, refresh } = useCira();
  const [preview, setPreview] = useState<CiraGroupLinkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!repo || !pendingGroupInviteCode) return;
    let cancelled = false;
    void repo.previewGroupLink(pendingGroupInviteCode).then((value) => {
      if (!cancelled) setPreview(value);
    }).catch((cause) => {
      if (!cancelled) setError(groupError(t, cause));
    });
    return () => { cancelled = true; };
  }, [repo, pendingGroupInviteCode, t]);

  if (!repo || !pendingGroupInviteCode) return null;
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await repo.acceptGroupLink(pendingGroupInviteCode);
      await refresh();
      clearPendingGroupInvite();
    } catch (cause) {
      setError(groupError(t, cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="cira-group-invite-title" className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-edge bg-elevated p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="cira-group-invite-title" className="text-[18px] font-medium text-ink">{t("Private group invitation")}</h3>
            {preview && <p className="mt-1 text-[12px] text-ink-subtle">{t("Invited by {name}", { name: preview.creatorDisplayName })}</p>}
          </div>
          <button aria-label={t("Close")} onClick={clearPendingGroupInvite} className="text-ink-subtle hover:text-ink"><X size={16} /></button>
        </div>
        {preview ? (
          <div className="rounded-xl border border-edge-soft bg-canvas/40 p-4">
            <p className="text-[15px] font-medium text-ink">{preview.groupName}</p>
            {preview.groupDescription && <p className="mt-1 text-[12.5px] text-ink-muted">{preview.groupDescription}</p>}
            <p className="mt-2 text-[11.5px] text-ink-subtle">{t("{count} members", { count: preview.memberCount })}</p>
          </div>
        ) : error ? <p className="text-[12.5px] text-danger">{error}</p> : <p className="text-[12.5px] text-ink-subtle">{t("Checking the invitation…")}</p>}
        <div className="flex justify-end gap-2">
          <ActionButton onClick={clearPendingGroupInvite}>{t("Cancel")}</ActionButton>
          <button onClick={() => void join()} disabled={!preview || busy} className="h-9 rounded-lg bg-ink px-4 text-[12px] font-semibold text-canvas disabled:opacity-45">{t("Join group")}</button>
        </div>
      </div>
    </div>
  );
}

function GroupDetails({ group }: { group: CiraGroup }) {
  const t = useT();
  const { repo, me, relationships, refresh } = useCira();
  const [members, setMembers] = useState<CiraGroupMember[]>([]);
  const [membersHasMore, setMembersHasMore] = useState(false);
  const [links, setLinks] = useState<CiraGroupLink[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ url: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = group.role === "owner" || group.role === "admin";
  const archived = group.archivedAt !== null;

  const load = async () => {
    if (!repo) return;
    try {
      const [nextMembers, nextLinks] = await Promise.all([
        repo.listGroupMembersPage(group.id),
        canManage ? repo.listGroupLinks(group.id) : Promise.resolve([]),
      ]);
      setMembers(nextMembers.items);
      setMembersHasMore(nextMembers.hasMore);
      setLinks(nextLinks);
      setError(null);
    } catch (cause) {
      setError(groupError(t, cause));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, group.id, group.updatedAt, canManage]);

  if (!repo || !me) return null;
  const memberIds = new Set(members.map((member) => member.userId));
  const inviteable = relationships.filter(
    (relationship) => relationship.status === "accepted" && relationship.profile.userId !== null
      && !memberIds.has(relationship.profile.userId),
  );
  const run = async (action: Promise<unknown>) => {
    setError(null);
    try {
      await action;
      await refresh();
      await load();
    } catch (cause) {
      setError(groupError(t, cause));
    }
  };

  const deleteGroup = async () => {
    if (!(await confirmDialog(t("Delete {name}? This removes the private group for everyone.", { name: group.name })))) return;
    await run(repo.deleteGroup(group.id));
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-canvas/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-medium text-ink">{group.name}</h3>
            <span className="rounded-full border border-edge-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-subtle">{t(group.role)}</span>
            {archived && (
              <span className="inline-flex items-center gap-1 rounded-full border border-edge-soft bg-elevated px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-subtle">
                <Archive size={11} />{t("Archived")}
              </span>
            )}
          </div>
          {group.description && <p className="mt-1 text-[12.5px] text-ink-muted">{group.description}</p>}
          <p className="mt-1 text-[11.5px] text-ink-subtle">{t("{count} of {limit} members", { count: group.memberCount, limit: group.maxMembers })}</p>
          {archived && <p className="mt-1 text-[11.5px] text-ink-subtle">{t("Archived groups are read-only: no new members, invitations, links, collections or VARA until restored.")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && <ActionButton onClick={() => setEditing((value) => !value)}><Settings2 size={13} />{t("Edit")}</ActionButton>}
          {canManage && (
            archived
              ? <ActionButton onClick={() => void run(repo.restoreGroup(group.id))}><ArchiveRestore size={13} />{t("Restore")}</ActionButton>
              : <ActionButton onClick={() => void confirmDialog(t("Archive {name}? It becomes read-only until you restore it. Nothing is deleted.", { name: group.name })).then((ok) => { if (ok) return run(repo.archiveGroup(group.id)); })}><Archive size={13} />{t("Archive")}</ActionButton>
          )}
          {group.role === "owner" ? (
            <ActionButton onClick={() => void deleteGroup()} danger><Trash2 size={13} />{t("Delete")}</ActionButton>
          ) : (
            <ActionButton onClick={() => void run(repo.leaveGroup(group.id))} danger><X size={13} />{t("Leave")}</ActionButton>
          )}
        </div>
      </div>

      {editing && <GroupForm group={group} onDone={() => setEditing(false)} />}

      {canManage && !archived && inviteable.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-edge-soft p-3" role="group" aria-label={t("Invite accepted CIRA relations")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] font-medium text-ink-muted">{t("Invite accepted CIRA relations")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFriends((cur) => cur.size === inviteable.length ? new Set() : new Set(inviteable.map((r) => r.profile.userId!)))}
                className="text-[11.5px] text-ink-subtle hover:text-ink"
              >
                {selectedFriends.size === inviteable.length ? t("Clear all") : t("Select all")}
              </button>
              <ActionButton
                disabled={inviting || selectedFriends.size === 0}
                onClick={() => {
                  const ids = [...selectedFriends];
                  setInviting(true);
                  setInviteNotice(null);
                  setError(null);
                  void repo.inviteGroupMembers(group.id, ids)
                    .then((res) => {
                      setSelectedFriends(new Set());
                      setInviteNotice(t("{invited} invited, {member} already members, {skipped} skipped.", { invited: res.invited, member: res.alreadyMember, skipped: res.skipped }));
                      return refresh().then(() => load());
                    })
                    .catch((cause) => setError(groupError(t, cause)))
                    .finally(() => setInviting(false));
                }}
              ><UserPlus size={13} />{t("Invite ({count})", { count: selectedFriends.size })}</ActionButton>
            </div>
          </div>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {inviteable.map((relationship) => {
              const id = relationship.profile.userId!;
              const checked = selectedFriends.has(id);
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-elevated/50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setSelectedFriends((cur) => {
                      const next = new Set(cur);
                      if (event.target.checked) next.add(id); else next.delete(id);
                      return next;
                    })}
                  />
                  <span className="min-w-0 truncate text-[13px] text-ink">{relationship.profile.displayName} <span className="text-ink-subtle">@{relationship.profile.handle}</span></span>
                </label>
              );
            })}
          </div>
          {inviteNotice && <p className="text-[11.5px] text-ink-subtle">{inviteNotice}</p>}
        </div>
      )}

      {canManage && !archived && (
        <div className="flex flex-col gap-2 rounded-xl border border-edge-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12.5px] font-medium text-ink">{t("Single-use group link")}</p>
              <p className="text-[11px] text-ink-subtle">{t("Valid for 15 minutes and one new member.")}</p>
            </div>
            <ActionButton onClick={() => void repo.createGroupLink(group.id).then((created) => {
              setSecret(created);
              void load();
            }).catch((cause) => setError(groupError(t, cause)))}><Link2 size={13} />{t("Create link")}</ActionButton>
          </div>
          {secret && (
            <div className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">{secret.url}</code>
              <button aria-label={t("Copy invite link")} onClick={() => void navigator.clipboard.writeText(secret.url).then(() => setCopied(true))} className="text-ink-subtle hover:text-ink">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
          {links.map((link) => (
            <div key={link.id} className="flex items-center justify-between text-[11.5px] text-ink-subtle">
              <span>{t("Active until {time}", { time: new Date(link.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span>
              <button onClick={() => void run(repo.revokeGroupLink(link.id))} className="text-danger hover:underline">{t("Revoke")}</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("Members")}</span>
        {members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge-soft px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-ink-muted">
                {member.role === "owner" ? <Crown size={14} /> : member.role === "admin" ? <Shield size={14} /> : <Users size={14} />}
              </span>
              <div className="min-w-0"><p className="truncate text-[13px] text-ink">{member.displayName}</p><p className="truncate text-[11px] text-ink-subtle">@{member.handle} · {t(member.role)}</p></div>
            </div>
            {group.role === "owner" && member.userId !== me.userId && member.role !== "owner" && (
              <div className="flex gap-2">
                <ActionButton onClick={() => void run(repo.setGroupRole(group.id, member.userId, member.role === "admin" ? "member" : "admin"))}>
                  {member.role === "admin" ? t("Make member") : t("Make admin")}
                </ActionButton>
                <ActionButton onClick={() => void confirmDialog(t("Transfer ownership to {name}?", { name: member.displayName })).then((ok) => {
                  if (ok) return run(repo.transferGroupOwnership(group.id, member.userId));
                })}>
                  {t("Transfer")}
                </ActionButton>
                <ActionButton onClick={() => void run(repo.removeGroupMember(group.id, member.userId))} danger>{t("Remove")}</ActionButton>
              </div>
            )}
            {group.role === "admin" && member.role === "member" && member.userId !== me.userId && (
              <ActionButton onClick={() => void run(repo.removeGroupMember(group.id, member.userId))} danger>{t("Remove")}</ActionButton>
            )}
          </div>
        ))}
        {membersHasMore && (
          <ActionButton onClick={() => void repo.listGroupMembersPage(group.id, members.length).then((page) => {
            setMembers((current) => {
              const known = new Set(current.map((member) => member.userId));
              return [...current, ...page.items.filter((member) => !known.has(member.userId))];
            });
            setMembersHasMore(page.hasMore);
          }).catch((cause) => setError(groupError(t, cause)))}>{t("Load more members")}</ActionButton>
        )}
      </div>

      <GroupCollections group={group} />

      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function CiraGroupsCard() {
  const t = useT();
  const { repo, groups } = useCira();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (!selectedId || !groups.some((group) => group.id === selectedId)) {
      setSelectedId(groups[0]?.id ?? null);
    }
  }, [groups, selectedId]);
  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);
  if (!repo) return null;

  return (
    <Section title={t("CIRA groups")} subtitle={t("Private circles with explicit membership and roles. Nothing is public or searchable.")}>
      <div className="flex flex-col gap-4">
        <GroupLinkDecision />
        <GroupInvitations />
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <button key={group.id} onClick={() => setSelectedId(group.id)} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[12.5px] transition-colors ${selectedId === group.id ? "border-ink bg-ink text-canvas" : "border-edge-soft text-ink-muted hover:border-edge"}`}>
              <Users size={14} />{group.name}<span className="opacity-65">{group.memberCount}</span>
            </button>
          ))}
          <button onClick={() => setCreating(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-edge px-3 text-[12.5px] text-ink-muted hover:text-ink"><Plus size={14} />{t("New group")}</button>
        </div>
        {creating && <GroupForm onDone={() => setCreating(false)} />}
        {!creating && selected && <GroupDetails group={selected} />}
        {!creating && groups.length === 0 && <p className="text-[13px] text-ink-subtle">{t("Create a private group for a part of your CIRA.")}</p>}
      </div>
    </Section>
  );
}
