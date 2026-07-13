// Display-only status for the authenticated remote VARA. It deliberately uses
// the monochrome player chrome and never receives media/source information.
import { LogOut, RadioTower } from "lucide-react";
import { useT } from "@/lib/i18n";

export function VaraStatusPill(props: {
  syncActive: boolean;
  isHost: boolean;
  memberCount: number;
  onLeaveRoom: () => void;
}) {
  const t = useT();
  const { syncActive, isHost, memberCount, onLeaveRoom } = props;
  const role = isHost ? t("host") : t("guest");

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/65 p-1 pl-2.5 text-white shadow-sm backdrop-blur-md">
      <span
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
        data-testid="vara-status-pill"
        data-state={syncActive ? "active" : "paused"}
      >
        <RadioTower className="h-3.5 w-3.5" aria-hidden />
        <span>{syncActive ? t("VEYA") : t("VEYA paused")}</span>
        <span className="text-white/55">· {role} · {memberCount}</span>
      </span>
      <button
        type="button"
        onClick={onLeaveRoom}
        className="grid h-7 w-7 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white"
        aria-label={t("Leave VARA")}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
