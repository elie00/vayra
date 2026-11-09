import { invoke } from "@tauri-apps/api/core";
import { Check, Loader2, Magnet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Handler = "checking" | "vayra" | "other" | "error";

/** macOS only: hand magnet links and .torrent files to VAYRA. */
export function TorrentLinksRow() {
  const t = useT();
  const [handler, setHandler] = useState<Handler>("checking");

  const refresh = useCallback(() => {
    invoke<boolean>("torrent_links_default")
      .then((own) => setHandler(own ? "vayra" : "other"))
      .catch(() => setHandler("error"));
  }, []);

  useEffect(refresh, [refresh]);

  const makeDefault = () => {
    setHandler("checking");
    invoke("torrent_links_make_default")
      .then(refresh)
      .catch(() => setHandler("error"));
  };

  const own = handler === "vayra";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3.5">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          own ? "bg-accent/15 text-accent" : "bg-raised text-ink-subtle"
        }`}
      >
        <Magnet size={15} strokeWidth={2.2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px] font-medium text-ink">{t("Open magnet links and .torrent files")}</span>
        <p className="text-[12.5px] leading-relaxed text-ink-subtle">
          {t("A magnet link or a .torrent file opens VAYRA's torrent card, where you pick the file to play. A torrent client installed before VAYRA keeps them until you hand them over.")}
        </p>
        <p aria-live="polite" className="text-[12px] font-medium text-ink-muted">
          {handler === "checking"
            ? t("Checking")
            : own
              ? t("VAYRA opens them.")
              : handler === "other"
                ? t("Another app opens them.")
                : t("macOS did not answer. Try again.")}
        </p>
      </div>
      {handler === "checking" ? (
        <Loader2 size={16} className="mt-1.5 shrink-0 animate-spin text-ink-subtle motion-reduce:animate-none" />
      ) : own ? (
        <Check size={18} strokeWidth={2.4} className="mt-1 shrink-0 text-accent" />
      ) : (
        <button
          type="button"
          onClick={makeDefault}
          className="mt-0.5 shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-canvas transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          {t("Use VAYRA")}
        </button>
      )}
    </div>
  );
}
