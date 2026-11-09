import { useEffect, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useT } from "@/lib/i18n";
import { onWatchActivityConsent, type WatchActivityRequest } from "@/lib/watch-activity-consent";

/** Asks before installing an addon that receives the user's watch activity. */
export function WatchActivityConsent() {
  const t = useT();
  const [queue, setQueue] = useState<WatchActivityRequest[]>([]);

  useEffect(() => onWatchActivityConsent((request) => setQueue((q) => [...q, request])), []);

  const current = queue[0];
  if (!current) return null;
  const answer = (allowed: boolean) => {
    current.resolve(allowed);
    setQueue((q) => q.slice(1));
  };
  return (
    <ConfirmationDialog
      title={t("Share your watch activity with {name}?", { name: current.name })}
      confirmLabel={t("Install")}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    >
      <p>
        {t("This add-on asks to be told what you play, pause and stop, and what you add to your library or mark as watched. Add-ons use this to sync a tracking service.")}
      </p>
      <p>{t("Install it only if you trust it.")}</p>
    </ConfirmationDialog>
  );
}
