import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";

// Jumelage d'un téléphone : QR encodant harbor://stremio-auth?key=<authKey>,
// scanné par l'appareil photo → VAYRA mobile se connecte directement.
export function ConnectPhoneModal({ onClose }: { onClose: () => void }) {
  const { authKey } = useAuth();
  const t = useT();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!authKey) return;
    const url = `harbor://stremio-auth?key=${encodeURIComponent(authKey)}`;
    QRCode.toDataURL(url, { width: 480, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [authKey]);

  const copyKey = () => {
    if (!authKey) return;
    void navigator.clipboard
      .writeText(authKey)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  if (!authKey) return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[210] flex items-center justify-center bg-canvas/80"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-in flex w-[min(92vw,400px)] flex-col gap-5 rounded-2xl border border-edge-soft bg-elevated p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display text-[22px] font-medium tracking-tight text-ink">
            {t("Connect your phone")}
          </h2>
          <p className="text-center text-[13px] leading-snug text-ink-muted">
            {t("Scan this code with your phone's camera. VAYRA opens already signed in.")}
          </p>
        </div>

        {qr && (
          <img
            src={qr}
            alt=""
            className="mx-auto aspect-square w-60 rounded-xl bg-white p-2"
            draggable={false}
          />
        )}

        <p className="text-center text-[12px] leading-snug text-ink-subtle">
          {t("No camera at hand? Copy the session key and paste it in the phone's sign-in screen.")}
        </p>

        <button
          type="button"
          onClick={copyKey}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-edge bg-elevated text-[14px] font-semibold text-ink transition-colors hover:bg-raised"
        >
          {copied ? (
            <>
              <Check size={15} strokeWidth={2.4} className="text-accent" />
              {t("Copied")}
            </>
          ) : (
            <>
              <Copy size={15} strokeWidth={2.2} />
              {t("Copy session key")}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="self-center text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
        >
          {t("Close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
