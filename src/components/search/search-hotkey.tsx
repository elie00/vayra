import { useEffect } from "react";
import { effectiveBinding, eventToBinding, isTypingTarget } from "@/lib/hotkeys";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { desktopUx, type DesktopUx } from "@/lib/platform";

/** The system Find shortcut each desktop expects: ⌘F on macOS, Ctrl+F on Windows. */
export function matchesAppSearchShortcut(
  event: KeyboardEvent,
  binding: string,
  os: DesktopUx | null = desktopUx(),
): boolean {
  if (eventToBinding(event) === binding) return true;
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") return false;
  if (os === "mac") return event.metaKey && !event.ctrlKey;
  if (os === "windows") return event.ctrlKey && !event.metaKey;
  return false;
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
