// Display-only status pill for the active Watch Room sync in the player.
// Uses monochrome player chrome and never receives media/source information.
import { Crown, RadioTower } from "lucide-react";
import { useT } from "@/lib/i18n";

export function VaraStatusPill(props: {
  syncActive: boolean;
  isHost: boolean;
  memberCount: number;
  drawerOpen?: boolean;
  onToggleDrawer?: () => void;
  onLeaveRoom?: () => void;
}) {
  const t = useT();
  const { syncActive, isHost, memberCount, drawerOpen = false, onToggleDrawer } = props;

  return (
    <button
      type="button"
      onClick={onToggleDrawer}
      aria-expanded={drawerOpen}
      aria-label={drawerOpen ? t("Close sync drawer") : t("Open sync drawer")}
      data-testid="vara-status-pill"
      data-state={syncActive ? "active" : "paused"}
      className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium text-white shadow-sm backdrop-blur-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
        drawerOpen
          ? "border-white/30 bg-black/85"
          : "border-white/15 bg-black/65 hover:border-white/25 hover:bg-black/80"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          syncActive ? "bg-emerald-400" : "bg-amber-400"
        }`}
        aria-hidden
      />
      <RadioTower className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
      <span className="tabular-nums">
        {syncActive
          ? t("Sync · {count}", { count: memberCount })
          : t("Sync paused · {count}", { count: memberCount })}
      </span>
      {isHost ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-white/12 px-1.5 py-0.5 text-[10.5px] font-medium text-white/90"
          title={t("host")}
        >
          <Crown className="h-3 w-3" aria-hidden />
          <span>{t("host")}</span>
        </span>
      ) : null}
    </button>
  );
}
