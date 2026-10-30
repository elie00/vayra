import { ArrowLeft, Bell, Bookmark, ChevronRight, Globe2, HelpCircle, Link2, Palette, PlayCircle, Radio, Settings2, UserRound, Users, type LucideIcon } from "lucide-react";
import { ProfileAvatar } from "@/chrome/sidebar/profile-chip";
import { useVayraAccount } from "@/lib/vayra-account";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { isSettingsSectionAvailable } from "@/views/settings/nav";
import type { SectionId } from "@/views/settings/shared";

/**
 * The phone settings, simplified as streaming apps keep theirs: the profile
 * and account first, then a handful of pages, each gathering what the desktop
 * splits into several sections. Getting started (a summary of other settings),
 * hotkeys, player layout and mpv tuning are left out: a phone has no use for them.
 */
export type MobileSettingsEntry = { id: string; label: string; Icon: LucideIcon; sections: SectionId[] };

export const MOBILE_ACCOUNT_ENTRY: MobileSettingsEntry = { id: "account", label: "Profile & account", Icon: UserRound, sections: ["account"] };

const GROUPS: { heading: string; entries: MobileSettingsEntry[] }[] = [
  {
    heading: "Viewing",
    entries: [
      { id: "playback", label: "Playback", Icon: PlayCircle, sections: ["player"] },
      { id: "languages", label: "Languages & subtitles", Icon: Globe2, sections: ["language"] },
      { id: "sources", label: "Sources", Icon: Link2, sections: ["streaming", "streamFilters", "p2p"] },
    ],
  },
  {
    heading: "App",
    entries: [
      { id: "appearance", label: "Appearance", Icon: Palette, sections: ["theme"] },
      { id: "library", label: "Library & metadata", Icon: Bookmark, sections: ["library"] },
      { id: "services", label: "Connected accounts", Icon: Radio, sections: ["trakt", "anilist", "mal", "simkl", "letterboxd"] },
      { id: "notifications", label: "Notifications", Icon: Bell, sections: ["webhooks"] },
    ],
  },
  {
    heading: "More",
    entries: [
      { id: "cira", label: "CIRA", Icon: Users, sections: ["cira"] },
      { id: "advanced", label: "Advanced", Icon: Settings2, sections: ["advanced", "relay"] },
      { id: "help", label: "Help", Icon: HelpCircle, sections: ["bug"] },
    ],
  },
];

function available(entry: MobileSettingsEntry): MobileSettingsEntry | null {
  const sections = entry.sections.filter(isSettingsSectionAvailable);
  return sections.length > 0 ? { ...entry, sections } : null;
}

export function mobileSettingsEntries(): MobileSettingsEntry[] {
  return [MOBILE_ACCOUNT_ENTRY, ...GROUPS.flatMap((g) => g.entries)].map(available).filter((e): e is MobileSettingsEntry => !!e);
}

/** The page that holds a section, for a request to open that section. */
export function mobileEntryFor(section: SectionId): MobileSettingsEntry | null {
  return mobileSettingsEntries().find((e) => e.sections.includes(section)) ?? null;
}

export function MobileSettingsList({ onPick }: { onPick: (entry: MobileSettingsEntry) => void }) {
  const t = useT();
  const { activeProfile } = useProfiles();
  const { settings } = useSettings();
  const { user } = useVayraAccount();
  return (
    <div className="flex flex-col gap-6 pb-6">
      <button
        type="button"
        onClick={() => onPick(MOBILE_ACCOUNT_ENTRY)}
        className="flex items-center gap-4 rounded-2xl bg-elevated p-4 text-start active:bg-raised"
      >
        <ProfileAvatar profile={activeProfile} fallbackAvatar={settings.harborAvatar} ring={false} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-title-3 font-semibold text-ink">{activeProfile?.name ?? t("Profile")}</span>
          <span className="truncate type-footnote text-ink-muted">{user?.email ?? t("Local profile")}</span>
        </span>
        <ChevronRight size={18} className="dir-icon text-ink-subtle" />
      </button>
      {GROUPS.map((group) => {
        const entries = group.entries.map(available).filter((e): e is MobileSettingsEntry => !!e);
        if (entries.length === 0) return null;
        return (
          <section key={group.heading} className="flex flex-col gap-1">
            <h2 className="px-2 pb-1 type-caption font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t(group.heading)}</h2>
            <ul className="flex flex-col overflow-hidden rounded-2xl bg-elevated">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onPick(entry)}
                    className="flex h-14 w-full items-center gap-4 px-4 text-start active:bg-raised"
                  >
                    <span className="text-ink-muted">
                      <entry.Icon size={22} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1 truncate type-callout text-ink">{t(entry.label)}</span>
                    <ChevronRight size={18} className="dir-icon text-ink-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
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
