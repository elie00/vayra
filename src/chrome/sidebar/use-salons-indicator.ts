import { useCira } from "@/lib/cira/provider";
import { useVara } from "@/lib/vara/provider";

export function useSalonsIndicator(): { hasDot: boolean; pendingCount: number; hasActiveRoom: boolean } {
  const { inbox } = useCira();
  const { activeRoom, invitations } = useVara();
  const pendingCount = (inbox?.unreadCount ?? 0) + invitations.length;
  const hasActiveRoom = activeRoom !== null;
  return {
    hasDot: hasActiveRoom || pendingCount > 0,
    pendingCount,
    hasActiveRoom,
  };
}
