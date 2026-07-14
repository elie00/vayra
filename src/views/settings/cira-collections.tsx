import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ListVideo,
  Pencil,
  Play,
  Plus,
  RadioTower,
  Trash2,
  X,
} from "lucide-react";
import type { CiraGroup } from "@/lib/cira";
import { useCira } from "@/lib/cira/provider";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import type { Meta, MetaType } from "@/lib/cinemeta";
import { VaraError } from "@/lib/vara/errors";
import { useVara } from "@/lib/vara/provider";
import type {
  VaraCollection,
  VaraCollectionItem,
  VaraCollectionItemInput,
  VaraCollectionMediaType,
} from "@/lib/vara/types";

const MEDIA_TYPES: VaraCollectionMediaType[] = ["movie", "series", "anime", "tv", "channel"];

function collectionError(t: ReturnType<typeof useT>, error: unknown): string {
  const code = error instanceof VaraError ? error.code : "UNKNOWN";
  const messages: Partial<Record<VaraError["code"], string>> = {
    INVALID_COLLECTION: t("Check the collection name and description."),
    COLLECTION_NOT_FOUND: t("This collection is no longer available."),
    COLLECTION_FORBIDDEN: t("You don't have permission to do that in this collection."),
    COLLECTION_LIMIT_REACHED: t("This group already has the maximum number of collections."),
    INVALID_COLLECTION_ITEM: t("Check the catalogue reference and poster image."),
    COLLECTION_ITEM_LIMIT_REACHED: t("This collection is full."),
    COLLECTION_ITEM_DUPLICATE: t("That title is already in this collection."),
    COLLECTION_ITEM_NOT_FOUND: t("This item is no longer in the collection."),
    VARA_SYNC_CONFLICT: t("Leave the current local watch session before entering a remote VARA."),
    RATE_LIMITED: t("Too many attempts. Wait a moment and try again."),
    NETWORK: t("Network error. Check your connection and try again."),
  };
  return messages[code] ?? t("Something went wrong. Try again.");
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
  primary,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? "bg-ink text-canvas hover:opacity-90"
          : danger
            ? "border border-danger/25 text-danger hover:bg-danger/10"
            : "border border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function toMeta(item: VaraCollectionItem): Meta {
  return {
    id: item.metaId,
    type: item.mediaType as MetaType,
    name: item.title,
    poster: item.posterUrl ?? undefined,
  };
}

function CollectionForm({
  groupId,
  collection,
  onDone,
}: {
  groupId: string;
  collection?: VaraCollection;
  onDone: () => void;
}) {
  const t = useT();
  const { repo } = useVara();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [membersCanEdit, setMembersCanEdit] = useState(collection?.membersCanEdit ?? false);
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
        membersCanEdit,
      };
      if (collection) await repo.updateCollection(collection.id, input);
      else await repo.createCollection(groupId, input);
      onDone();
    } catch (cause) {
      setError(collectionError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-canvas/50 p-4">
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {t("Collection name")}
        <input
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {t("Private description")}
        <textarea
          value={description}
          maxLength={240}
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
          className="resize-none rounded-lg border border-edge bg-elevated p-3 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      <label className="flex items-start gap-2.5 text-[12.5px] text-ink-muted">
        <input
          type="checkbox"
          checked={membersCanEdit}
          onChange={(event) => setMembersCanEdit(event.target.checked)}
          className="mt-0.5"
        />
        <span>{t("Let members add and reorder items. Only owners and admins can rename or delete the collection.")}</span>
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Btn onClick={onDone}>{t("Cancel")}</Btn>
        <Btn primary onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? t("Saving…") : collection ? t("Save") : t("Create collection")}
        </Btn>
      </div>
    </div>
  );
}

function AddItemForm({
  collectionId,
  onDone,
}: {
  collectionId: string;
  onDone: () => void;
}) {
  const t = useT();
  const { repo } = useVara();
  const [metaId, setMetaId] = useState("");
  const [mediaType, setMediaType] = useState<VaraCollectionMediaType>("movie");
  const [title, setTitle] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const episodic = mediaType === "series" || mediaType === "anime";
  if (!repo) return null;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: VaraCollectionItemInput = {
        metaId: metaId.trim(),
        mediaType,
        title: title.trim(),
        posterUrl: posterUrl.trim() || null,
        season: episodic && season.trim() ? Number(season) : null,
        episode: episodic && episode.trim() ? Number(episode) : null,
      };
      await repo.addCollectionItem(collectionId, input);
      onDone();
    } catch (cause) {
      setError(collectionError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-canvas/50 p-4">
      <p className="text-[11.5px] text-ink-subtle">
        {t("Add a public catalogue reference. No source, stream, addon or progress is ever stored.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
          {t("Catalogue ID (e.g. tt0111161, kitsu:44042)")}
          <input
            value={metaId}
            maxLength={128}
            onChange={(event) => setMetaId(event.target.value)}
            className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
          {t("Type")}
          <select
            value={mediaType}
            onChange={(event) => setMediaType(event.target.value as VaraCollectionMediaType)}
            className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
          >
            {MEDIA_TYPES.map((type) => (
              <option key={type} value={type}>{t(`media.${type}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {t("Title")}
        <input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      {episodic && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
            {t("Season (optional)")}
            <input
              type="number"
              min={0}
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
            {t("Episode (optional)")}
            <input
              type="number"
              min={0}
              value={episode}
              onChange={(event) => setEpisode(event.target.value)}
              className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {t("Poster image URL (https only, optional)")}
        <input
          value={posterUrl}
          maxLength={2048}
          placeholder="https://…"
          onChange={(event) => setPosterUrl(event.target.value)}
          className="h-10 rounded-lg border border-edge bg-elevated px-3 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Btn onClick={onDone}>{t("Cancel")}</Btn>
        <Btn primary onClick={() => void add()} disabled={busy || !metaId.trim() || !title.trim()}>
          {busy ? t("Adding…") : t("Add item")}
        </Btn>
      </div>
    </div>
  );
}

function CollectionDetail({
  collection,
  onBack,
  onChanged,
}: {
  collection: VaraCollection;
  onBack: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { repo, activateRoom, syncConflict } = useVara();
  const { openMeta } = useView();
  const [items, setItems] = useState<VaraCollectionItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Serializes item mutations so a rapid double-click can't fire two moves with
  // the same stale position before the list reloads.
  const [mutating, setMutating] = useState(false);
  // useT() returns a fresh function each render; keep it in a ref so callbacks
  // used as effect dependencies stay stable and never loop.
  const tRef = useRef(t);
  tRef.current = t;

  const cancelledRef = useRef(false);
  const load = useCallback(async () => {
    if (!repo) return;
    try {
      const page = await repo.listCollectionItemsPage(collection.id);
      if (cancelledRef.current) return;
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
    } catch (cause) {
      if (!cancelledRef.current) setError(collectionError(tRef.current, cause));
    }
  }, [repo, collection.id]);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load, collection.updatedAt]);

  if (!repo) return null;

  const run = async (action: Promise<unknown>) => {
    if (mutating) return;
    setMutating(true);
    setError(null);
    try {
      await action;
      await load();
      onChanged();
    } catch (cause) {
      setError(collectionError(t, cause));
    } finally {
      setMutating(false);
    }
  };

  const move = (item: VaraCollectionItem, direction: -1 | 1) => {
    if (mutating) return;
    // Clamp against the true total (itemCount), not the loaded page, so an item
    // can move past the current page; the RPC clamps to the real bound anyway.
    const target = item.position + direction;
    if (target < 1 || target > collection.itemCount) return;
    void run(repo.moveCollectionItem(item.id, target));
  };

  const startVara = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        if (syncConflict) throw new VaraError("VARA_SYNC_CONFLICT");
        const room = await repo.createRoom(4 * 60 * 60, 8);
        activateRoom(room);
      } catch (cause) {
        setError(collectionError(t, cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const remove = async (item: VaraCollectionItem) => {
    if (!(await confirmDialog(t("Remove “{title}” from this collection?", { title: item.title })))) return;
    await run(repo.removeCollectionItem(item.id));
  };

  const deleteCollection = async () => {
    if (!(await confirmDialog(t("Delete “{name}”? This removes the collection for the whole group.", { name: collection.name })))) return;
    setError(null);
    try {
      await repo.deleteCollection(collection.id);
      onChanged();
      onBack();
    } catch (cause) {
      setError(collectionError(t, cause));
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-canvas/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onBack} className="mb-1 text-[11.5px] text-ink-subtle hover:text-ink">← {t("All collections")}</button>
          <h4 className="text-[15px] font-medium text-ink">{collection.name}</h4>
          {collection.description && <p className="mt-1 text-[12.5px] text-ink-muted">{collection.description}</p>}
          <p className="mt-1 text-[11px] text-ink-subtle">
            {collection.createdBy
              ? t("Created by {name}", { name: collection.createdBy.displayName })
              : t("Created by a former member")}
            {" · "}
            {collection.updatedBy
              ? t("last edit by {name}", { name: collection.updatedBy.displayName })
              : t("last edit by a former member")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={startVara} disabled={busy} title={t("Create a private VARA room to watch together")}>
            <RadioTower size={13} />{t("Start a VARA")}
          </Btn>
          {collection.canManage && (
            <Btn onClick={() => setEditing((value) => !value)}><Pencil size={13} />{t("Edit")}</Btn>
          )}
          {collection.canManage && (
            <Btn danger onClick={() => void deleteCollection()}><Trash2 size={13} />{t("Delete")}</Btn>
          )}
        </div>
      </div>

      {editing && collection.canManage && (
        <CollectionForm
          groupId={collection.groupId}
          collection={collection}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("{count} items", { count: collection.itemCount })}
        </span>
        {collection.canEditItems && !adding && (
          <Btn onClick={() => setAdding(true)}><Plus size={13} />{t("Add item")}</Btn>
        )}
      </div>

      {adding && collection.canEditItems && (
        <AddItemForm
          collectionId={collection.id}
          onDone={() => {
            setAdding(false);
            void run(Promise.resolve());
          }}
        />
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border border-edge-soft bg-elevated/50 px-3 py-2.5">
            <span className="w-6 text-center text-[12px] tabular-nums text-ink-subtle">{item.position}</span>
            {item.posterUrl ? (
              <img src={item.posterUrl} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-canvas text-ink-subtle"><ListVideo size={14} /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{item.title}</p>
              <p className="truncate text-[11px] text-ink-subtle">
                {t(`media.${item.mediaType}`)}
                {item.season != null && ` · ${t("S{season}", { season: item.season })}`}
                {item.episode != null && ` ${t("E{episode}", { episode: item.episode })}`}
                {item.addedBy && ` · ${t("added by {name}", { name: item.addedBy.displayName })}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Btn onClick={() => openMeta(toMeta(item))} title={t("Open in VAYRA")}><Play size={13} />{t("Open")}</Btn>
              {collection.canEditItems && (
                <>
                  <button
                    aria-label={t("Move up")}
                    disabled={mutating || item.position <= 1}
                    onClick={() => move(item, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-soft text-ink-muted hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    aria-label={t("Move down")}
                    disabled={mutating || item.position >= collection.itemCount}
                    onClick={() => move(item, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-soft text-ink-muted hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    aria-label={t("Remove")}
                    disabled={mutating}
                    onClick={() => void remove(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-danger/25 text-danger hover:bg-danger/10 disabled:opacity-30"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-[12.5px] text-ink-subtle">{t("No items yet. Add a catalogue reference to start the list.")}</p>
        )}
        {hasMore && (
          <Btn onClick={() => void repo.listCollectionItemsPage(collection.id, items.length).then((page) => {
            setItems((current) => {
              const known = new Set(current.map((entry) => entry.id));
              return [...current, ...page.items.filter((entry) => !known.has(entry.id))];
            });
            setHasMore(page.hasMore);
          }).catch((cause) => setError(collectionError(t, cause)))}>
            {t("Load more items")}
          </Btn>
        )}
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function GroupCollections({ group }: { group: CiraGroup }) {
  const t = useT();
  const { repo } = useVara();
  const { repo: ciraRepo } = useCira();
  const [collections, setCollections] = useState<VaraCollection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<number | null>(null);
  // useT() returns a fresh function each render; keep it in a ref so callbacks
  // used as effect dependencies stay stable and never loop.
  const tRef = useRef(t);
  tRef.current = t;
  const canManage = group.role === "owner" || group.role === "admin";

  const load = useCallback(async () => {
    if (!repo) return;
    try {
      const page = await repo.listGroupCollectionsPage(group.id);
      setCollections(page.items);
      setHasMore(page.hasMore);
      setError(null);
    } catch (cause) {
      // A group with no collections yet is an empty state, not a failure.
      if (cause instanceof VaraError && cause.code === "PROFILE_REQUIRED") {
        setCollections([]);
      } else {
        setError(collectionError(tRef.current, cause));
      }
    } finally {
      setReady(true);
    }
  }, [repo, group.id]);

  useEffect(() => {
    setSelectedId(null);
    setCreating(false);
    void load();
  }, [load]);

  // Reuse the private per-user CIRA invalidation ping: any collection or item
  // mutation notifies every group member, coalesced to absorb bursts.
  useEffect(() => {
    if (!ciraRepo) return;
    const unsubscribe = ciraRepo.subscribeInvalidations(() => {
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void load();
      }, 300);
    });
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [ciraRepo, load]);

  const selected = useMemo(
    () => collections.find((collection) => collection.id === selectedId) ?? null,
    [collections, selectedId],
  );

  if (!repo) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge-soft bg-canvas/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium text-ink">{t("Collections")}</p>
          <p className="text-[11px] text-ink-subtle">{t("Private lists of catalogue titles shared inside this group.")}</p>
        </div>
        {canManage && !creating && !selected && (
          <Btn onClick={() => setCreating(true)}><Plus size={13} />{t("New collection")}</Btn>
        )}
      </div>

      {creating && (
        <CollectionForm
          groupId={group.id}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {selected ? (
        <CollectionDetail
          collection={selected}
          onBack={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      ) : (
        !creating && (
          <div className="flex flex-col gap-2">
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => setSelectedId(collection.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-soft bg-elevated/40 px-3 py-2.5 text-left hover:border-edge"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink">{collection.name}</p>
                  <p className="truncate text-[11px] text-ink-subtle">
                    {t("{count} items", { count: collection.itemCount })}
                    {collection.membersCanEdit && ` · ${t("members can edit")}`}
                  </p>
                </div>
                <ListVideo size={15} className="shrink-0 text-ink-subtle" />
              </button>
            ))}
            {ready && collections.length === 0 && (
              <p className="text-[12.5px] text-ink-subtle">
                {canManage
                  ? t("No collections yet. Create one to share a list of titles with the group.")
                  : t("No collections yet.")}
              </p>
            )}
            {hasMore && (
              <Btn onClick={() => void repo.listGroupCollectionsPage(group.id, collections.length).then((page) => {
                setCollections((current) => {
                  const known = new Set(current.map((entry) => entry.id));
                  return [...current, ...page.items.filter((entry) => !known.has(entry.id))];
                });
                setHasMore(page.hasMore);
              }).catch((cause) => setError(collectionError(t, cause)))}>
                {t("Load more collections")}
              </Btn>
            )}
          </div>
        )
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
