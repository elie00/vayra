import { Laptop } from "lucide-react";
import { fmtTime } from "@/components/player/transport/transport-utils";
import { emitAppFeedback } from "@/lib/app-feedback";
import { forgetMac, macStatusLabel, useLinkStatus, useMacPosition } from "@/lib/connect/link";
import { useT } from "@/lib/i18n";

/** VAYRA Connect on the phone: the paired Mac, and what it plays. */
export function MacLinkRow() {
  const t = useT();
  const { mac, connected, state } = useLinkStatus();
  const position = useMacPosition(state);

  if (!mac) {
    return (
      <p className="rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-subtle">
        {t("On your Mac, turn on VAYRA Connect in Settings → Advanced, then scan its code with this phone's camera.")}
      </p>
    );
  }

  const forget = () => {
    forgetMac().catch(() => emitAppFeedback({ kind: "error", text: t("This Mac couldn't be forgotten. Try again.") }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            connected ? "bg-accent/15 text-accent" : "bg-raised text-ink-subtle"
          }`}
        >
          <Laptop size={15} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium text-ink">{mac.name}</span>
          <span aria-live="polite" className="text-[12px] text-ink-subtle">
            {connected ? t("Connected") : t("Looking for your Mac on this Wi-Fi…")}
          </span>
        </div>
      </div>

      {connected && (
        <div className="flex min-w-0 flex-col gap-0.5 border-t border-edge-soft pt-3">
          {state ? (
            <>
              <span className="truncate text-[13px] font-medium text-ink">{state.title}</span>
              <span className="text-[12px] tabular-nums text-ink-subtle">
                {macStatusLabel(state.status, t)} · {fmtTime(position)} / {fmtTime(state.durationSec)}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-ink-muted">{t("Nothing playing on the Mac")}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={forget}
        className="self-start rounded-full border border-edge-soft px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
      >
        {t("Forget this Mac")}
      </button>
    </div>
  );
}
