import { Layers, Plus } from "lucide-react";
import { useState } from "react";
import { MAX_LISTS, reorderLists, useCustomLists } from "@/lib/custom-lists";
import { useT } from "@/lib/i18n";
import { CreateListModal } from "@/components/lists/create-list-modal";
import { ListCard } from "@/components/lists/list-card";
import { ListDetail } from "./list-detail";

export function MyListsTab() {
  const t = useT();
  const lists = useCustomLists();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const dropOn = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      const ids = lists.map((l) => l.id);
      const to = ids.indexOf(targetId);
      ids.splice(ids.indexOf(dragId), 1);
      ids.splice(to, 0, dragId);
      reorderLists(ids);
    }
    setDragId(null);
    setOverId(null);
  };

  if (selectedListId) {
    return <ListDetail listId={selectedListId} onBack={() => setSelectedListId(null)} />;
  }

  const atMax = lists.length >= MAX_LISTS;

  return (
    <section className="flex flex-col gap-6">
      {lists.length > 0 && (
        <div className="vayra-surface flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <span className="text-[12.5px] font-medium tabular-nums text-ink-muted">
            {t("{n} / {max} lists", { n: lists.length, max: MAX_LISTS })}
          </span>
          <button
            type="button"
            disabled={atMax}
            onClick={() => setCreating(true)}
            className="mac-primary-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={15} strokeWidth={2.2} />
            {t("Create new list")}
          </button>
        </div>
      )}

      {lists.length === 0 ? (
        <EmptyLists onCreate={() => setCreating(true)} />
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {lists.map((l) => (
            <div
              key={l.id}
              draggable
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                setDragId(l.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragId && overId !== l.id) setOverId(l.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(l.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={`cursor-grab rounded-2xl transition-[background-color,border-color,color,opacity,box-shadow] active:cursor-grabbing ${dragId === l.id ? "opacity-40" : ""} ${
                overId === l.id && dragId !== l.id ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""
              }`}
            >
              <ListCard list={l} onOpen={setSelectedListId} />
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateListModal
          onClose={() => setCreating(false)}
          onCreated={(id) => setSelectedListId(id)}
        />
      )}
    </section>
  );
}

function EmptyLists({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="vayra-surface flex flex-col items-center gap-4 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-edge-soft/75 bg-elevated/80 text-ink-subtle">
        <Layers size={24} strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.015em] text-ink">{t("Create your first list")}</h2>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
          {t("Group the movies and shows you love. Rewatch shelf, weekend picks, whatever keeps them close.")}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mac-primary-button mt-1"
      >
        <Plus size={17} strokeWidth={2.2} />
        {t("New list")}
      </button>
    </div>
  );
}
