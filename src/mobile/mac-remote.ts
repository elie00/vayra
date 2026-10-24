import { useSyncExternalStore } from "react";

/** Whether the remote for the paired Mac is open, shared with the Back handler. */
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export const openMacRemote = () => set(true);
export const closeMacRemote = () => set(false);
export const isMacRemoteOpen = () => open;

export function useMacRemoteOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
