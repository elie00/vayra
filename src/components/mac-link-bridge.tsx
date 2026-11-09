import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { emitAppFeedback } from "@/lib/app-feedback";
import { connectResumes, lumaResumesFromConnect, ownResumes, sendHistoryToMac } from "@/lib/connect/history";
import { onLinkStatus, pairWithMac, readPairing, setLinkStatus, startLink, useLinkStatus, type PairedMac } from "@/lib/connect/link";
import { lumaStore, useLuma } from "@/lib/luma";
import { onConnectPair } from "@/lib/deep-link";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

/**
 * VAYRA Connect on the phone: keeps the paired Mac connected while the app is
 * in front, and asks before pairing with the Mac a scanned code points to.
 */
export function MacLinkBridge() {
  const t = useT();
  const { openSettings } = useView();
  const [offer, setOffer] = useState<{ url: string; mac: PairedMac } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Where the Mac left off joins this phone's Continue Watching.
  const { connected, history } = useLinkStatus();
  const imported = useRef("");
  useEffect(() => {
    if (!history?.length) return;
    const key = JSON.stringify(history);
    if (key === imported.current) return;
    imported.current = key;
    lumaStore().importResumes(lumaResumesFromConnect(history));
  }, [history]);

  // And where this phone left off goes to the Mac, at most every 15 seconds
  // while it plays.
  const luma = useLuma();
  const mine = JSON.stringify(
    ownResumes(
      connectResumes(
        luma.document.preferences.rememberActivity
          ? luma.document.resumes.map((entry) => ({ kind: "local" as const, entry, at: entry.updatedAt }))
          : [],
      ),
      history,
    ),
  );
  const lastSent = useRef(0);
  useEffect(() => {
    if (!connected) return;
    const wait = Math.max(0, lastSent.current + 15_000 - Date.now());
    const timer = window.setTimeout(() => {
      lastSent.current = Date.now();
      void sendHistoryToMac(JSON.parse(mine)).catch(() => { /* The Mac went away: sent on the next connection. */ });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [mine, connected]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      startLink().catch((error) => console.warn("[connect] link could not start", error));
    };
    onLinkStatus(setLinkStatus)
      .then((unlisten) => {
        if (cancelled) return unlisten();
        stop = unlisten;
        resume();
        document.addEventListener("visibilitychange", resume);
      })
      .catch((error) => console.warn("[connect] link status unavailable", error));
    return () => {
      cancelled = true;
      stop?.();
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  useEffect(
    () =>
      onConnectPair((url) => {
        readPairing(url)
          .then((mac) => {
            setFailed(false);
            setOffer({ url, mac });
          })
          .catch(() => emitAppFeedback({ kind: "error", text: t("This code doesn't pair with a Mac on your Wi-Fi.") }));
      }),
    [t],
  );

  if (!offer) return null;

  const pair = () => {
    setBusy(true);
    pairWithMac(offer.url)
      .then(() => {
        setOffer(null);
        openSettings("advanced");
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <ConfirmationDialog
      title={t("Pair with {name}?", { name: offer.mac.name })}
      confirmLabel={t("Pair")}
      onConfirm={pair}
      onCancel={() => setOffer(null)}
      busy={busy}
      error={failed ? t("Pairing failed. Scan the code again.") : null}
    >
      <p>{t("This phone will see what plays on {name} ({address}) and control it.", offer.mac)}</p>
      <p>{t("Pair only with your own Mac.")}</p>
    </ConfirmationDialog>
  );
}
