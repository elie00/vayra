// VaraStatusPill — display-only sync-status indicator for the VARA demo room
// (PR6). Renders the §3.6 machine state as a small pill with a join/leave
// affordance. It NEVER touches player control callbacks or playback — it only
// reflects state and calls openRoom/leaveRoom on the room hook.
//
// Styling mirrors the existing player-chrome pill patterns
// (waiting-for-room.tsx readyPillClass).

import { RadioTower, Users, Wifi, WifiOff } from "lucide-react";
import type { RoomRole, RoomState } from "@/lib/together/sync/room-machine";

// A short, human label per machine state (host/guest role folded in).
function stateLabel(state: RoomState, role: RoomRole): string {
  switch (state) {
    case "solo":
      return "Solo";
    case "lobby":
      return "Lobby";
    case "error":
      return "Broker hors ligne";
    case "host":
      return "Hôte";
    case "guest":
      return "Invité";
    case "connected":
      return role === "host" ? "Hôte · connecté" : "Invité · connecté";
    case "synced":
      return "Synchronisé";
    case "syncing":
      return "Synchronisation…";
    case "desynced":
      return "Désynchronisé";
  }
}

function pillClass(state: RoomState): string {
  switch (state) {
    case "synced":
    case "connected":
      return "bg-emerald-500/15 text-emerald-300";
    case "syncing":
    case "lobby":
      return "bg-white/10 text-white/70";
    case "host":
    case "guest":
      return "bg-sky-500/15 text-sky-300";
    case "desynced":
      return "bg-info/15 text-info";
    case "error":
      return "bg-red-500/15 text-red-300";
    case "solo":
      return "bg-white/5 text-white/50";
  }
}

function StateIcon({ state }: { state: RoomState }) {
  const cls = "h-3.5 w-3.5";
  if (state === "error") return <WifiOff className={cls} aria-hidden />;
  if (state === "solo" || state === "lobby") return <Wifi className={cls} aria-hidden />;
  if (state === "connected" || state === "synced" || state === "syncing" || state === "desynced")
    return <Users className={cls} aria-hidden />;
  return <RadioTower className={cls} aria-hidden />;
}

export function VaraStatusPill(props: {
  state: RoomState;
  role: RoomRole;
  memberCount: number;
  onOpenRoom: () => void;
  onLeaveRoom: () => void;
}) {
  const { state, role, memberCount, onOpenRoom, onLeaveRoom } = props;
  const isSolo = state === "solo";
  const label = stateLabel(state, role);
  const showCount = memberCount > 1 && state !== "solo" && state !== "error";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pillClass(
          state,
        )}`}
        data-testid="vara-status-pill"
        data-state={state}
      >
        <StateIcon state={state} />
        <span>{label}</span>
        {showCount ? <span className="opacity-70">· {memberCount}</span> : null}
      </span>
      {isSolo ? (
        <button
          type="button"
          onClick={onOpenRoom}
          className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/20"
        >
          VARA
        </button>
      ) : (
        <button
          type="button"
          onClick={onLeaveRoom}
          className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/20"
        >
          Quitter
        </button>
      )}
    </div>
  );
}
