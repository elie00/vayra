import { Eraser, Eye, EyeOff, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n";
import { BigButton } from "./big-button";

export function DrawToggle({
  active,
  hideOthers,
  onToggle,
  onToggleHideOthers,
  onClear,
}: {
  active: boolean;
  hideOthers: boolean;
  onToggle: () => void;
  onToggleHideOthers: () => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center">
      <BigButton
        onClick={onToggle}
        ariaLabel={active ? t("Stop drawing") : t("Draw on screen")}
        tooltip={active ? t("Stop drawing") : t("Draw")}
        active={active}
      >
        <Pencil size={19} strokeWidth={1.9} />
      </BigButton>
      {active && (
        <>
          <BigButton
            onClick={onClear}
            ariaLabel={t("Clear drawings")}
            tooltip={t("Clear drawings")}
          >
            <Eraser size={19} strokeWidth={1.9} />
          </BigButton>
          <BigButton
            onClick={onToggleHideOthers}
            ariaLabel={hideOthers ? t("Show others' drawings") : t("Hide others' drawings")}
            tooltip={hideOthers ? t("Show others' drawings") : t("Hide others' drawings")}
            active={hideOthers}
          >
            {hideOthers ? <EyeOff size={19} strokeWidth={1.9} /> : <Eye size={19} strokeWidth={1.9} />}
          </BigButton>
        </>
      )}
    </div>
  );
}
