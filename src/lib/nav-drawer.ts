import { useSyncExternalStore } from "react";

// Shared open/close state for the mobile navigation drawer (the left Sidebar
// turns into a slide-over on mobile Tauri). Kept as a tiny module store so the
// hamburger (in the topbar), the drawer, and its backdrop can share it without
// threading props through Shell. Desktop never opens it.
let open = false;
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
}

export function setNavDrawer(v: boolean): void {
  if (open === v) return;
  open = v;
  emit();
}

export function toggleNavDrawer(): void {
  setNavDrawer(!open);
}

export function useNavDrawer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => open,
    () => false,
  );
}
