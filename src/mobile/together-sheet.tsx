import { Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TogetherPopover } from "@/components/together-modal";
import { useT } from "@/lib/i18n";
import { useTogether } from "@/lib/together/provider";

// Mobile entry point for Watch Together. The desktop TogetherButton anchors a
// popover to the topbar; on mobile that popover content is reused inside a
// bottom sheet (same pattern as src/mobile/play-picker.tsx). Both pieces read
// the shared modalOpen state from the Together provider, so the Android Back
// handler (mobile-integration.tsx) can close the sheet via closeModal().

/** Compact topbar button. Hidden until a relay is configured or a session is
 * live/connecting — first-time setup happens in Settings → relay or by pasting
 * an invite link there. */
export function MobileTogetherButton() {
  const { enabled, snapshot, openModal } = useTogether();
  const t = useT();
  const live = snapshot.state === "joined";
  if (!enabled && !live && snapshot.state !== "connecting") return null;
  return (
    <button
      type="button"
      onClick={openModal}
      aria-label={t("chrome.watchTogether")}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-edge-soft/60 transition-colors ${
        live ? "bg-elevated text-ink" : "bg-elevated/80 text-ink-muted opacity-80"
      }`}
    >
      <Users size={17} strokeWidth={1.9} />
      {live && snapshot.participants.length > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9.5px] font-bold leading-none text-canvas">
          {snapshot.participants.length}
        </span>
      )}
    </button>
  );
}

/** Full-width bottom sheet hosting the Together panel. Mounted once from
 * MobileShell; renders only while the provider's modal is open. */
export function MobileTogetherSheet() {
  const { modalOpen, closeModal } = useTogether();
  const t = useT();

  // Drag-down-to-close on the sheet handle (same gesture as MobilePlayPicker).
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex='0']")
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex='0']",
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [closeModal, modalOpen]);
  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    setDrag(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (drag > 90) closeModal();
    startY.current = null;
    setDrag(0);
  };

  if (!modalOpen) return null;

  return (
    <div className="fixed inset-0 z-[140]">
      {/* Backdrop — tap to dismiss. */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={closeModal}
        className="absolute inset-0 bg-black/50"
      />

      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Watch together")}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className="harbor-together-surface absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-3rem)] min-h-[55dvh] flex-col rounded-t-3xl ring-1 ring-edge-soft/70 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)]"
      >
        {/* Drag handle */}
        <div
          role="button"
          tabIndex={0}
          aria-label={t("Drag down to close")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") closeModal();
          }}
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
        >
          <span className="h-1.5 w-11 rounded-full bg-ink-subtle/40" />
        </div>

        <TogetherPopover variant="sheet" />
      </section>
    </div>
  );
}
