import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import type { AddonErrorItem } from "./stream-presentation";

export function AddonErrorBanner({ errors }: { errors: AddonErrorItem[] }) {
  const t = useT();
  const { setView } = useView();

  if (errors.length === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <AlertTriangle
          size={15}
          strokeWidth={2.1}
          className="mt-0.5 shrink-0 text-danger"
          aria-hidden
        />
        <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12.5px] leading-snug">
          {errors.map((item, idx) => (
            <li
              key={`${item.addonName}-${item.message}-${idx}`}
              className="truncate text-ink-muted"
              title={`${item.addonName}: ${item.message}`}
            >
              <span className="font-semibold text-ink">{item.addonName}</span>
              <span className="mx-1.5 text-ink-subtle" aria-hidden>
                ·
              </span>
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => setView("addons")}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg bg-elevated/80 px-2.5 text-[12px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised sm:self-center"
      >
        <SlidersHorizontal size={12} strokeWidth={2.2} aria-hidden />
        {t("Manage addons")}
      </button>
    </div>
  );
}
