import { Pencil, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";

type Props = {
  editMode: boolean;
  hasChanges: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
};

function BarButtons({ editMode, hasChanges, onToggleEdit, onReset }: Props) {
  const t = useT();
  return (
    <>
      {editMode && hasChanges && (
        <button
          onClick={onReset}
          className="flex h-8 items-center gap-1.5 rounded-md border border-edge-soft/40 bg-canvas/80 px-2.5 text-[12px] font-medium text-ink-muted backdrop-blur-md transition-colors hover:bg-canvas hover:text-ink"
        >
          <RotateCcw size={12} strokeWidth={2.2} />
          {t("Reset")}
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
        {editMode ? t("Done editing") : t("Customize page")}
      </button>
    </>
  );
}

export function CatalogCustomizeBar(props: Props) {
  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <BarButtons {...props} />
      </div>
      {props.editMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-edge-soft bg-canvas/95 px-3 py-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.75)] backdrop-blur-md">
            <BarButtons {...props} />
          </div>
        </div>
      )}
    </>
  );
}
