import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/** Avoid flashing a loader for already cached route modules. */
export function ViewLoading() {
  const [visible, setVisible] = useState(false);
  const t = useT();
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div role="status" className="flex h-full min-h-40 items-center justify-center text-sm text-ink-muted">{t("Loading…")}</div>;
}
