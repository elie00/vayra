import { ListPlus, Pencil, RotateCcw, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { HomeRowCustomization } from "@/lib/home-customization";

const pillClass =
  "flex h-8 items-center gap-1.5 rounded-md border border-edge-soft/40 bg-canvas/80 px-2.5 text-[12px] font-medium text-ink-muted backdrop-blur-md transition-colors hover:bg-canvas hover:text-ink";

export function CustomizeBar({
  editMode,
  customization,
  onToggleEdit,
  onReset,
  onAddSource,
  availableListRows,
  onAddListRow,
}: {
  editMode: boolean;
  customization: HomeRowCustomization;
  onToggleEdit: () => void;
  onReset: () => void;
  onAddSource?: () => void;
  availableListRows?: { id: string; name: string }[];
  onAddListRow?: (id: string) => void;
}) {
  const t = useT();
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) setListMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [listMenuOpen]);

  const hasChanges =
    customization.order.length > 0 ||
    customization.hidden.length > 0 ||
    Object.keys(customization.renamed).length > 0;
  const canAddList = editMode && !!onAddListRow && (availableListRows?.length ?? 0) > 0;

  return (
    <div className="flex items-center justify-end gap-2">
      {editMode && hasChanges && (
        <button onClick={onReset} className={pillClass}>
          <RotateCcw size={12} strokeWidth={2.2} />
          {t("Reset")}
        </button>
      )}
      {canAddList && (
        <div ref={listRef} className="relative">
          <button onClick={() => setListMenuOpen((v) => !v)} className={pillClass}>
            <ListPlus size={12} strokeWidth={2.2} />
            {t("Add from lists")}
          </button>
          {listMenuOpen && (
            <div className="absolute bottom-full end-0 mb-1.5 max-h-60 w-52 overflow-y-auto rounded-lg border border-edge-soft bg-canvas/95 p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.75)] backdrop-blur-md">
              {availableListRows!.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    onAddListRow!(l.id);
                    setListMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-[12.5px] text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  <ListPlus size={13} className="shrink-0 text-ink-subtle" />
                  <span className="truncate">{l.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {editMode && onAddSource && (
        <button onClick={onAddSource} className={pillClass}>
          <Plus size={12} strokeWidth={2.2} />
          {t("Add Source")}
        </button>
      )}
      <button
        onClick={onToggleEdit}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium backdrop-blur-md transition-colors ${
          editMode
            ? "border-ink bg-ink text-canvas hover:opacity-90"
            : "border-edge-soft/40 bg-canvas/80 text-ink-muted hover:bg-canvas hover:text-ink"
        }`}
      >
        <Pencil size={12} strokeWidth={2.4} />
        {editMode ? t("Done editing") : t("Customize home")}
      </button>
    </div>
  );
}
