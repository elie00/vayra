import { useEffect } from "react";
import { isTypingTarget } from "@/lib/hotkeys";
import { useView, type View } from "@/lib/view";

// Touches 1-9 : saut rapide vers une room (ordre de la sidebar). Inactif pendant
// la lecture/picker, en saisie, ou avec un modificateur (evite le clash ctrl+1).
const ROOMS: View[] = [
  "home",
  "discover",
  "movies",
  "shows",
  "anime",
  "live",
  "vod",
  "calendar",
  "library",
];

export function RoomHotkeys() {
  const { setView, topKind } = useView();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e)) return;
      if (topKind === "player" || topKind === "picker") return;
      if (e.key < "1" || e.key > "9") return;
      const room = ROOMS[Number(e.key) - 1];
      if (!room) return;
      e.preventDefault();
      setView(room);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, topKind]);

  return null;
}
