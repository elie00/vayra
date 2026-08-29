import { useEffect } from "react";
import { effectiveBinding, eventToBinding, isTypingTarget } from "@/lib/hotkeys";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { isMacDesktop } from "@/lib/platform";

export function matchesAppSearchShortcut(
  event: KeyboardEvent,
  binding: string,
  mac = isMacDesktop(),
): boolean {
  if (eventToBinding(event) === binding) return true;
  return (
    mac &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "f"
  );
}

export function SearchHotkey() {
  const { setOpen } = useSearch();
  const { settings } = useSettings();
  const binding = effectiveBinding("globalSearchFocus", settings.hotkeys ?? {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;
      if (!matchesAppSearchShortcut(e, binding)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binding, setOpen]);
  return null;
}
