import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0">
      <path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.42-.19-2.1H12v3.98h5.38a4.6 4.6 0 0 1-2 3.02v2.58h3.24c1.9-1.75 2.98-4.33 2.98-7.48Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.58c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.66A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.82A6.01 6.01 0 0 1 6.08 12c0-.63.11-1.24.31-1.82V7.52H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.48l3.34-2.66Z" />
      <path fill="#EA4335" d="M12 6.05c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.52l3.34 2.66C7.18 7.81 9.39 6.05 12 6.05Z" />
    </svg>
  );
}

export function GoogleSignInButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-edge bg-white px-4 text-[14px] font-semibold text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-[transform,box-shadow,background-color] hover:scale-[1.01] hover:bg-[#f8f9fa] hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
    >
      {busy ? <Loader2 size={17} className="animate-spin text-[#5f6368]" /> : <GoogleMark />}
      {t("Continue with Google")}
    </button>
  );
}
