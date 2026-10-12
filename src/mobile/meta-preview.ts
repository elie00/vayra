import { useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";

/** The title previewed in the mobile sheet, shared by every card that can open it. */
let current: Meta | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function previewMeta(meta: Meta): void {
  current = meta;
  emit();
}

export function isMetaPreviewOpen(): boolean {
  return current !== null;
}

export function closeMetaPreview(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function useMetaPreview(): Meta | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
