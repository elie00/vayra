import { useCallback, useState } from "react";

export const MAX_SLOTS = 4;

export type Layout = "1" | "2" | "3" | "2x2";

export type SlotChannel = { name: string; url: string; userAgent?: string };

export type MultiviewState = {
  slots: (SlotChannel | null)[];
  layout: Layout;
  audioFocus: number;
};

const LAYOUT_KEY = "harbor.multiview.layout";
const SLOTS_KEY = "harbor.multiview.slots";

function initialLayout(): Layout {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LAYOUT_KEY) : null;
  return v === "1" || v === "2" || v === "3" || v === "2x2" ? v : "2x2";
}

function initialSlots(): (SlotChannel | null)[] {
  const empty = () => Array.from({ length: MAX_SLOTS }, () => null);
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty();
    return Array.from({ length: MAX_SLOTS }, (_, i) => {
      const item = parsed[i];
      if (item && typeof item === "object" && typeof item.name === "string" && typeof item.url === "string") {
        return {
          name: item.name,
          url: item.url,
          ...(typeof item.userAgent === "string" ? { userAgent: item.userAgent } : {}),
        };
      }
      return null;
    });
  } catch {
    return empty();
  }
}

function saveSlots(slots: (SlotChannel | null)[]): void {
  try {
    if (slots.every((s) => s == null)) {
      localStorage.removeItem(SLOTS_KEY);
    } else {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    }
  } catch {
    /* noop */
  }
}

export function layoutSlotCount(l: Layout): number {
  if (l === "1") return 1;
  if (l === "2") return 2;
  if (l === "3") return 3;
  return 4;
}

export function useMultiviewStore() {
  const [slots, setSlots] = useState<(SlotChannel | null)[]>(initialSlots);
  const [layout, setLayoutState] = useState<Layout>(initialLayout);
  const [audioFocus, setAudioFocus] = useState(0);

  const setSlot = useCallback((i: number, ch: SlotChannel | null) => {
    setSlots((cur) => {
      const next = cur.slice();
      next[i] = ch;
      saveSlots(next);
      return next;
    });
  }, []);

  const setLayout = useCallback((l: Layout) => {
    setLayoutState(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    const cleared = Array.from({ length: MAX_SLOTS }, () => null);
    setSlots(cleared);
    saveSlots(cleared);
    setAudioFocus(0);
  }, []);

  return {
    slots,
    layout,
    audioFocus,
    setSlot,
    setLayout,
    setAudioFocus,
    reset,
  };
}
