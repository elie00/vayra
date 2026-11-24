import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useActiveKid } from "@/lib/profiles";
import { useView } from "@/lib/view";

export function BackChrome() {
  const { canGoBack, goBack, topKind, chromeHidden, meta } = useView();
  const kid = useActiveKid();
  const t = useT();
  if (!canGoBack || chromeHidden) return null;
  if (topKind === "picker") return null;
  if (kid) {
    return (
      <button
        onClick={goBack}
        className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-white/90 ps-4 pe-6 text-[16px] font-extrabold text-[#0e3a43] shadow-[0_10px_24px_-10px_rgba(20,60,70,0.5)] backdrop-blur-md transition-transform duration-200 hover:scale-[1.05] active:scale-[0.97]"
      >
        <ArrowLeft size={22} strokeWidth={2.8} className="dir-icon" />
        {t("common.back")}
      </button>
    );
  }
  // Downloads opened from a title's picker name the title Back returns to.
  const label = topKind === "downloads" && meta ? t("Back to {title}", { title: meta.name }) : t("common.back");
  return (
    <button
      type="button"
      onClick={goBack}
      className="vayra-chrome-pill h-9 min-w-0 max-w-[20rem] shrink-0 gap-2 ps-3 pe-4 text-[13px] font-medium"
    >
      <ArrowLeft size={15} strokeWidth={2.1} className="dir-icon shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
