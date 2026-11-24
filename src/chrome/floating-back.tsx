import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

export function FloatingBack({
  offsetLeft = 24,
  offsetTop = 90,
}: {
  offsetLeft?: number;
  offsetTop?: number;
}) {
  const { canGoBack, goBack, exitPlayback, topKind, chromeHidden } = useView();
  const t = useT();
  if (!canGoBack || chromeHidden) return null;
  const deep =
    topKind === "meta" ||
    topKind === "collection" ||
    topKind === "person" ||
    topKind === "filter" ||
    topKind === "award" ||
    topKind === "anime-award" ||
    topKind === "service" ||
    topKind === "addon-detail" ||
    topKind === "queue";
  if (!deep) return null;
  void exitPlayback;
  const onClick = goBack;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("common.back")}
      style={{ position: "fixed", top: offsetTop, insetInlineStart: offsetLeft, zIndex: 70 }}
      className="vayra-chrome-pill h-9 gap-2 ps-3 pe-4 text-[13px] font-medium"
    >
      <ArrowLeft size={15} strokeWidth={2.1} className="dir-icon" />
      {t("common.back")}
    </button>
  );
}
