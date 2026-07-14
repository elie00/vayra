import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, ListVideo, Loader2 } from "lucide-react";
import { useCira } from "@/lib/cira/provider";
import { useT } from "@/lib/i18n";
import { VaraError } from "@/lib/vara/errors";
import { useVara } from "@/lib/vara/provider";
import type {
  VaraCollection,
  VaraCollectionItemInput,
  VaraCollectionMediaType,
} from "@/lib/vara/types";
import { AnchoredMenu } from "@/components/anchored-menu";
import { emitListToast } from "./list-toast";

const MEDIA_TYPES: VaraCollectionMediaType[] = ["movie", "series", "anime", "tv", "channel"];

/** Public catalogue reference for the media currently on screen. */
export type CollectionSeed = {
  metaId: string;
  type: string;
  title: string;
  poster?: string | null;
};

function toItemInput(seed: CollectionSeed): VaraCollectionItemInput {
  const mediaType: VaraCollectionMediaType =
    (MEDIA_TYPES as string[]).includes(seed.type)
      ? (seed.type as VaraCollectionMediaType)
      : "movie";
  // The whole title is referenced, so never a specific season/episode here.
  return {
    metaId: seed.metaId,
    mediaType,
    title: seed.title,
    posterUrl: seed.poster?.startsWith("https://") ? seed.poster : null,
    season: null,
    episode: null,
  };
}

type Row = { groupName: string; collection: VaraCollection };

export function AddToCollectionMenu({
  seed,
  anchorRef,
  open,
  onClose,
}: {
  seed: CollectionSeed;
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { repo } = useVara();
  const { groups } = useCira();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!open || !repo) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    void (async () => {
      try {
        // Collections the caller may actually add to, across every group.
        const perGroup = await Promise.all(
          groups.map(async (group) => {
            const page = await repo.listGroupCollectionsPage(group.id, 0, 100);
            return page.items
              .filter((collection) => collection.canEditItems)
              .map((collection) => ({ groupName: group.name, collection }));
          }),
        );
        if (cancelled) return;
        setRows(perGroup.flat());
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof VaraError && cause.code === "NETWORK"
            ? tRef.current("Network error. Check your connection and try again.")
            : tRef.current("Something went wrong. Try again."),
        );
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, repo, groups]);

  if (!repo) return null;

  const add = async (row: Row) => {
    if (pending) return;
    setPending(row.collection.id);
    try {
      let input = toItemInput(seed);
      try {
        await repo.addCollectionItem(row.collection.id, input);
      } catch (cause) {
        // A poster the CDN serves in a shape the whitelist rejects must not
        // block adding the title itself: retry once without the image.
        if (cause instanceof VaraError && cause.code === "INVALID_COLLECTION_ITEM"
            && input.posterUrl) {
          input = { ...input, posterUrl: null };
          await repo.addCollectionItem(row.collection.id, input);
        } else {
          throw cause;
        }
      }
      setAdded((current) => new Set(current).add(row.collection.id));
      emitListToast(t('Added to "{name}"', { name: row.collection.name }));
    } catch (cause) {
      const code = cause instanceof VaraError ? cause.code : "UNKNOWN";
      emitListToast(
        code === "COLLECTION_ITEM_DUPLICATE"
          ? t("That title is already in this collection.")
          : code === "COLLECTION_ITEM_LIMIT_REACHED"
            ? t("This collection is full.")
            : code === "COLLECTION_FORBIDDEN"
              ? t("You don't have permission to do that in this collection.")
              : t("Something went wrong. Try again."),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <AnchoredMenu anchorRef={anchorRef} open={open} onClose={onClose} width={288}>
      <div className="animate-popover-in overflow-hidden rounded-2xl border border-edge-soft bg-elevated shadow-[0_18px_50px_-15px_rgba(0,0,0,0.6)]">
        <div className="border-b border-edge-soft/55 px-3.5 pt-3 pb-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
            {t("Add to a group collection")}
          </span>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1.5">
          {rows === null && (
            <p className="flex items-center gap-2 px-3.5 py-3 text-[12.5px] text-ink-subtle">
              <Loader2 size={14} className="animate-spin" />
              {t("Loading…")}
            </p>
          )}
          {error && <p className="px-3.5 py-3 text-[12.5px] text-danger">{error}</p>}
          {rows !== null && !error && rows.length === 0 && (
            <p className="px-3.5 py-3 text-[12.5px] leading-snug text-ink-subtle">
              {t("No collection you can edit. Create one from a CIRA group in Settings.")}
            </p>
          )}
          {rows?.map((row) => {
            const isAdded = added.has(row.collection.id);
            const isPending = pending === row.collection.id;
            return (
              <button
                key={row.collection.id}
                disabled={isPending || isAdded}
                onClick={() => void add(row)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-60"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    isAdded ? "border-accent bg-accent/15 text-accent" : "border-edge"
                  }`}
                >
                  {isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isAdded ? (
                    <Check size={13} strokeWidth={2.6} />
                  ) : (
                    <ListVideo size={12} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.collection.name}</span>
                  <span className="block truncate text-[11px] text-ink-subtle">{row.groupName}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">
                  {row.collection.itemCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </AnchoredMenu>
  );
}
