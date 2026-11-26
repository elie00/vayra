import { ArrowRight, RadioTower } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useVara } from "@/lib/vara/provider";
import { useView } from "@/lib/view";

export function ActiveRoomBanner() {
  const t = useT();
  const { activeRoom, invitations } = useVara();
  const { setView } = useView();

  const pendingInvite = !activeRoom ? invitations[0] ?? null : null;
  if (!activeRoom && !pendingInvite) return null;

  const isActive = activeRoom !== null;
  const memberCount = activeRoom?.members.length ?? 0;
  const label = isActive
    ? memberCount === 1
      ? t("Active room · 1 participant")
      : t("Active room · {count} participants", { count: memberCount })
    : `${t("Room invitation")} · ${pendingInvite!.inviter.displayName}`;

  return (
    <div
      data-testid="active-room-banner"
      className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-edge-soft bg-elevated/80 px-4 py-2.5 backdrop-blur-sm sm:mx-8 lg:mx-12"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-emerald-400" : "bg-accent"}`}
          aria-hidden
        />
        <RadioTower className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <p className="truncate text-[13px] font-medium text-ink">{label}</p>
      </div>
      <button
        type="button"
        onClick={() => setView("salons")}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>{isActive ? t("Open") : t("Join")}</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
