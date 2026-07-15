import { HelpCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PRIVATE_BETA_HELP } from "@/lib/private-beta-help";
import { Section } from "./shared";

export function PrivateBetaHelpCard() {
  const t = useT();
  return (
    <Section
      title={t("Watch Room help")}
      subtitle={t("Private recovery steps for common CIRA, VARA and VEYA situations.")}
    >
      <div className="grid gap-2">
        {PRIVATE_BETA_HELP.map((item) => (
          <details key={item.id} className="group rounded-xl border border-edge-soft bg-canvas/35 open:bg-canvas/55">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[13px] font-medium text-ink marker:hidden">
              <HelpCircle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="flex-1">{t(item.title)}</span>
              <span className="text-ink-subtle transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <div className="border-t border-edge-soft px-4 py-3 ps-11">
              <p className="text-[12.5px] leading-5 text-ink-muted">{t(item.explanation)}</p>
              <p className="mt-2 text-[12px] font-medium leading-5 text-ink">{t(item.action)}</p>
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}
