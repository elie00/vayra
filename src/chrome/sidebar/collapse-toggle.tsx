import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

export function CollapseToggle({
  collapsed,
  compact = false,
}: {
  collapsed: boolean;
  compact?: boolean;
}) {
  const { update } = useSettings();
  const t = useT();
  const label = collapsed ? t("Expand sidebar") : t("Collapse sidebar");
  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      onClick={() => update({ sidebarCollapsed: !collapsed })}
      aria-label={label}
      aria-pressed={collapsed}
      title={label}
      className={`flex items-center justify-center rounded-lg text-ink-subtle transition-colors duration-150 hover:bg-elevated/75 hover:text-ink ${
        compact
          ? "h-8 w-8 shrink-0"
          : collapsed
            ? "h-9 w-9 shrink-0 rounded-xl"
            : "h-9 w-full gap-2.5 min-[960px]:justify-start min-[960px]:px-3"
      }`}
    >
      {collapsed ? (
        <PanelLeftOpen size={16} strokeWidth={1.85} className="dir-icon" />
      ) : (
        <PanelLeftClose size={16} strokeWidth={1.85} className="dir-icon" />
      )}
      {!collapsed && !compact && (
        <span className="hidden text-[12.5px] font-medium min-[960px]:inline">{t("Collapse")}</span>
      )}
    </button>
  );
}
