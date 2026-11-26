import { useEffect, useState } from "react";
import { Film, Plus, RadioTower, Users } from "lucide-react";
import type { Meta, MetaType } from "@/lib/cinemeta";
import type { CiraGroup } from "@/lib/cira";
import { useCira } from "@/lib/cira/provider";
import { useT } from "@/lib/i18n";
import { useVara } from "@/lib/vara/provider";
import type { VaraCollection, VaraCollectionItem } from "@/lib/vara/types";
import { useView } from "@/lib/view";

function itemToMeta(item: VaraCollectionItem): Meta {
  return {
    id: item.metaId,
    type: item.mediaType as MetaType,
    name: item.title,
    poster: item.posterUrl ?? undefined,
  };
}

function GroupCard({
  group,
  onStartInRoom,
  busy,
}: {
  group: CiraGroup;
  onStartInRoom: (groupId: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const { repo } = useVara();
  const { openMeta } = useView();
  const [collections, setCollections] = useState<VaraCollection[]>([]);
  const [itemsByCollection, setItemsByCollection] = useState<Record<string, VaraCollectionItem[]>>({});

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    void repo
      .listGroupCollectionsPage(group.id, 0, 20)
      .then(async (page) => {
        if (cancelled) return;
        setCollections(page.items);
        const entries = await Promise.all(
          page.items.map(async (col) => {
            const itemsPage = await repo.listCollectionItemsPage(col.id, 0, 50);
            return [col.id, itemsPage.items] as const;
          }),
        );
        if (!cancelled) {
          setItemsByCollection(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        if (!cancelled) setCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, group.id]);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/45 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-ink">{group.name}</h3>
            {group.archivedAt && (
              <span className="rounded-full bg-raised px-2 py-0.5 text-[10.5px] font-medium text-ink-subtle">
                {t("Archived")}
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-subtle">
            {t("{count} members", { count: group.memberCount })}
            {group.description ? ` · ${group.description}` : ""}
          </p>
        </div>
        {!group.archivedAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStartInRoom(group.id)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <RadioTower size={13} aria-hidden />
            {t("Start in room")}
          </button>
        )}
      </div>

      {collections.length > 0 ? (
        <div className="flex flex-col gap-4 border-t border-edge-soft/60 pt-4">
          {collections.map((col) => {
            const items = itemsByCollection[col.id] ?? [];
            return (
              <div key={col.id} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-ink">{col.name}</h4>
                  <span className="text-[11.5px] tabular-nums text-ink-subtle">
                    {t("{count} titles", { count: items.length })}
                  </span>
                </div>
                {items.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openMeta(itemToMeta(item))}
                        className="group flex flex-col gap-1.5 text-start focus-visible:outline-none"
                      >
                        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-elevated ring-1 ring-edge-soft/70 transition-[transform,border-color] duration-150 group-hover:scale-[1.02] group-hover:ring-edge">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-ink-subtle">
                              <Film size={20} aria-hidden />
                            </div>
                          )}
                        </div>
                        <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-ink-muted group-hover:text-ink">
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-subtle">
                    {t("No titles in this collection yet.")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-subtle">
          {t("Shared collections added to this group appear here with posters.")}
        </p>
      )}
    </article>
  );
}

export function GroupsTab({ onRoomStarted }: { onRoomStarted: () => void }) {
  const t = useT();
  const { groups, groupInvitations, repo: ciraRepo, refresh: refreshCira } = useCira();
  const { repo: varaRepo, activateRoom } = useVara();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGroup = async () => {
    if (!ciraRepo || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ciraRepo.createGroup({
        name: name.trim(),
        description: description.trim() || null,
        avatarKey: null,
        maxMembers: 12,
      });
      await refreshCira();
      setName("");
      setDescription("");
      setCreating(false);
    } catch {
      setError(t("Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const startInRoom = async (groupId: string) => {
    if (!varaRepo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await varaRepo.createRoom(undefined, undefined, groupId);
      activateRoom(room);
      onRoomStarted();
    } catch {
      setError(t("Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {t("Private groups with shared collections and 1-click rooms.")}
        </p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          <Plus size={14} strokeWidth={2.4} aria-hidden />
          {t("New group")}
        </button>
      </div>

      {creating && (
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-elevated/50 p-4">
          <div className="flex flex-wrap gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Group name")}
              maxLength={48}
              className="h-10 min-w-52 flex-1 rounded-xl border border-edge bg-canvas px-3 text-[13.5px] text-ink outline-none focus:border-ink"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("Description (optional)")}
              maxLength={120}
              className="h-10 min-w-52 flex-1 rounded-xl border border-edge bg-canvas px-3 text-[13.5px] text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!name.trim() || busy}
              onClick={() => void createGroup()}
              className="inline-flex h-9 items-center rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-canvas disabled:opacity-45"
            >
              {busy ? t("Saving…") : t("Create group")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="inline-flex h-9 items-center rounded-xl border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted hover:text-ink"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12.5px] text-danger">{error}</p>}

      {groupInvitations.length > 0 && ciraRepo && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Group invitations")}
          </h3>
          {groupInvitations.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/45 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{inv.groupName}</p>
                <p className="truncate text-[12px] text-ink-subtle">
                  {t("Invited by {name}", { name: inv.inviter.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void ciraRepo
                      .acceptGroupInvitation(inv.id)
                      .then(refreshCira)
                      .finally(() => setBusy(false));
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] font-semibold text-canvas"
                >
                  {t("Accept")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void ciraRepo
                      .declineGroupInvitation(inv.id)
                      .then(refreshCira)
                      .finally(() => setBusy(false));
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-edge-soft px-3 text-[12px] font-medium text-ink-muted hover:text-ink"
                >
                  {t("Decline")}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge-soft bg-canvas/35 px-6 py-12 text-center">
          <Users size={22} className="text-ink-subtle" aria-hidden />
          <p className="text-[14px] font-medium text-ink">{t("No groups yet")}</p>
          <p className="max-w-md text-[12.5px] text-ink-subtle">
            {t("Create a private group to curate shared movie collections and launch rooms together.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              busy={busy}
              onStartInRoom={(id) => void startInRoom(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
