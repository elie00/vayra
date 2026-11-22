import { Keyboard, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HOTKEYS, effectiveBinding, formatBindingForDisplay } from "@/lib/hotkeys";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useFocusTrap } from "@/lib/use-focus-trap";

const ESSENTIAL_IDS = new Set([
  "playerPlayPause",
  "playerFullscreen",
  "playerMute",
  "playerVolumeUp",
  "playerVolumeDown",
  "playerSeekBack10",
  "playerSeekForward10",
  "playerSubtitleCycle",
  "playerSpeedUp",
  "playerSpeedDown",
  "playerNextEpisode",
  "playerStreamSwitcher",
  "playerPip",
  "playerStats",
  "playerClose",
]);

export function PlayerShortcutsSheet() {
  const t = useT();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key === "?") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const items = useMemo(
    () =>
      HOTKEYS.filter((h) => h.scope === "Player" && ESSENTIAL_IDS.has(h.id)).map((h) => ({
        id: h.id,
        label: h.label,
        binding: formatBindingForDisplay(effectiveBinding(h.id, settings.hotkeys ?? {})),
      })),
    [settings.hotkeys],
  );

  if (!open) return null;

  return (
    <div className="animate-fade-in absolute inset-0 z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Close")}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-shortcuts-title"
        tabIndex={-1}
        className="animate-modal-in relative flex max-h-[82vh] w-[min(92vw,540px)] flex-col overflow-hidden rounded-2xl border border-edge bg-elevated/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        <header className="flex items-center justify-between border-b border-edge-soft px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Keyboard size={18} className="text-accent" aria-hidden="true" />
            <h2 id="player-shortcuts-title" className="font-display text-[18px] font-semibold tracking-[-0.015em] text-ink">
              {t("Keyboard shortcuts")}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("Close")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-canvas/45 px-3.5 py-2.5"
            >
              <span className="truncate text-[13px] text-ink-muted">{t(item.label)}</span>
              <kbd className="shrink-0 rounded-md border border-edge-soft bg-elevated px-2 py-0.5 font-mono text-[11.5px] font-medium text-ink">
                {item.binding}
              </kbd>
            </div>
          ))}
        </div>
        <footer className="border-t border-edge-soft px-6 py-3 text-center text-[12px] text-ink-subtle">
          {t("Press ? or Esc to close")}
        </footer>
      </div>
    </div>
  );
}
