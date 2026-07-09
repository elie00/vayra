import { CornerDownLeft } from "lucide-react";
import type { AiProvider } from "@/lib/ai-models";
import { ProviderLogo } from "@/components/ai-provider-logo";
import { useT } from "@/lib/i18n";

export function AiSuggestButton({
  query,
  provider,
  onRun,
}: {
  query: string;
  provider: AiProvider;
  onRun: () => void;
}) {
  const t = useT();
  return (
    <button
      onClick={onRun}
      className="group animate-ai-entrance relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-2xl border border-accent/40 bg-accent/10 px-5 text-start transition-colors hover:bg-accent/15"
    >
      <span className="ai-hover-sheen pointer-events-none absolute inset-0 -translate-x-full skew-x-[-16deg] bg-gradient-to-r from-transparent via-ink/10 to-transparent opacity-0" />
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent/20">
        <ProviderLogo provider={provider} size={20} round />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {t("AI search")}
        </span>
        <span className="truncate text-[15px] font-semibold text-ink">
          {t("Ask AI to find titles for \"{query}\"", { query })}
        </span>
      </span>
      <CornerDownLeft
        size={15}
        className="ms-auto shrink-0 translate-x-0 text-ink-subtle opacity-50 transition-all group-hover:translate-x-[3px] group-hover:opacity-100"
      />
    </button>
  );
}
