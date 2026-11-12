import { useCallback, useEffect, useRef, useState } from "react";

/** How long a closing sheet stays mounted to slide away; the CSS exit is shorter. */
export const SHEET_EXIT_MS = 240;

/**
 * Keeps a sheet mounted while it slides away. `shown` is the last non-null
 * value; `closing` is true from the moment the value goes null until the exit
 * has played, and marks the wrapper with `data-closing`.
 */
export function useSheetPresence<T>(value: T | null): { shown: T | null; closing: boolean } {
  const [kept, setKept] = useState<T | null>(value);
  if (value !== null && kept !== value) setKept(value);

  useEffect(() => {
    if (value !== null) return;
    const id = window.setTimeout(() => setKept(null), SHEET_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [value]);

  return { shown: value ?? kept, closing: value === null && kept !== null };
}

/**
 * For a sheet its parent unmounts on close: `close` plays the exit first, then
 * tells the parent. Returns whether the exit is playing, for `data-closing`.
 */
export function useSheetClose(onClose: () => void): [closing: boolean, close: () => void] {
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const close = useCallback(() => {
    if (timer.current !== null) return;
    setClosing(true);
    timer.current = window.setTimeout(() => onCloseRef.current(), SHEET_EXIT_MS);
  }, []);

  return [closing, close];
}
