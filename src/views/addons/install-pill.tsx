import { Loader2, Plus, Settings2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { manifestRequiresConfiguration } from "@/lib/addon-store";
import type { ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { nameOf, withMinDuration } from "./addons-utils";
import { UninstallAddonButton } from "./uninstall-addon-button";

const MIN_INSTALL_FEEDBACK_MS = 650;

export function InstallPill({
  resolved,
  installed,
  onInstall,
  onUninstall,
  returnFocusRef,
}: {
  resolved: ResolvedAddon;
  installed: boolean;
  onInstall: () => void | Promise<void>;
  onUninstall: () => void | Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const runInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await withMinDuration(onInstall(), MIN_INSTALL_FEEDBACK_MS);
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <button
        disabled
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink/80 px-5 text-[13.5px] font-semibold text-canvas transition-transform duration-150"
      >
        <Loader2 size={14} strokeWidth={2.4} className="animate-spin" />
        {t("Installing")}
      </button>
    );
  }

  if (installed) {
    return (
      <UninstallAddonButton name={nameOf(resolved)} onUninstall={onUninstall} returnFocusRef={returnFocusRef} />
    );
  }
  const needsConfigure = manifestRequiresConfiguration(resolved.manifest);
  if (needsConfigure) {
    return (
      <button
        onClick={runInstall}
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-canvas transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
      >
        <Settings2 size={14} strokeWidth={2.2} />
        {t("Set up")}
      </button>
    );
  }
  return (
    <button
      onClick={runInstall}
      className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-canvas transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
    >
      <Plus size={14} strokeWidth={2.6} />
      {t("Install")}
    </button>
  );
}
