import { ArrowLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { NAV_GROUPS } from "@/views/settings/nav";
import type { SectionId } from "@/views/settings/shared";

// Sections that only make sense with a keyboard or the desktop player: the
// phone player is not customisable and runs on ExoPlayer, not mpv.
const DESKTOP_ONLY: SectionId[] = ["hotkeys", "playerLayout", "mpv"];

export function mobileSettingsGroups() {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !DESKTOP_ONLY.includes(i.id)) })).filter((g) => g.items.length > 0);
}

/**
 * The phone settings, as Android lays them out: a list of sections grouped
 * under headings, each opening as its own page, instead of a rail of pills
 * above a desktop page.
 */
export function MobileSettingsList({ onPick }: { onPick: (id: SectionId) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-6 pb-6">
      {mobileSettingsGroups().map((group, gi) => (
        <section key={group.heading ?? gi} className="flex flex-col gap-1">
          {group.heading && (
            <h2 className="px-2 pb-1 type-caption font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t(group.heading)}</h2>
          )}
          <ul className="flex flex-col overflow-hidden rounded-2xl bg-elevated">
            {group.items.map(({ id, label, Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="flex h-14 w-full items-center gap-4 px-4 text-start active:bg-raised"
                >
                  <span className="text-ink-muted">
                    <Icon size={22} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1 truncate type-callout text-ink">{t(label)}</span>
                  <ChevronRight size={18} className="dir-icon text-ink-subtle" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The settings' own top app bar on a phone: Back and the page title. */
export function MobileSettingsBar({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <header className="fixed inset-x-0 top-0 z-[60] bg-canvas pt-[var(--harbor-status-bar,1.75rem)]">
      <div className="flex h-16 items-center gap-1 px-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink active:bg-elevated"
        >
          <ArrowLeft size={22} strokeWidth={2.2} className="dir-icon" />
        </button>
        <h1 className="min-w-0 flex-1 truncate type-title-2 font-semibold text-ink">{title}</h1>
      </div>
    </header>
  );
}
