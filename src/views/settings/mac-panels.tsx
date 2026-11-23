import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { Section, useSettingsActiveContext } from "./shared";
import { NAV_GROUPS } from "./nav";
import { MAC_SETTINGS_GROUPS } from "./mac-settings-nav";
import { BackupRow } from "./backup-row";
import { SettingsRecoverRow } from "./settings-recover-row";
import { PrivacyRow } from "./privacy-row";
import { DownloadDirBar } from "../downloads/download-dir-bar";
import { AutomaticBackups } from "./automatic-backups";

const allNavItems = NAV_GROUPS.flatMap((g) => g.items);

export function MacConnectionsPanel() {
  const t = useT();
  const { setActive } = useSettingsActiveContext();
  const { setView } = useView();
  return (
    <>
      <Section title={t("Extensions")} subtitle={t("Install, configure and manage your content sources in one place.")}>
        <button type="button" className="mac-primary-button" onClick={() => setView("addons")}>
          {t("Manage extensions")}
          <ArrowUpRight size={14} strokeWidth={2.2} />
        </button>
      </Section>
      <Section title={t("Optional connections")} subtitle={t("Your VAYRA account is independent. Connect only the services you use.")}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {MAC_SETTINGS_GROUPS.find((g) => g.id === "connections")!.children.map((id) => {
            const item = allNavItems.find((it) => it.id === id);
            if (!item) return null;
            const Icon = item.Icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className="group flex items-center gap-3 rounded-xl border border-edge-soft/70 bg-canvas/55 px-3.5 py-3 text-start transition-[border-color,background-color,color] duration-150 hover:border-edge hover:bg-elevated/80"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge-soft/70 bg-elevated text-ink-muted transition-colors group-hover:text-ink">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                  {t(item.label)}
                </span>
                <ChevronRight size={15} className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}
export function MacPrivacyPanel() {
  const t = useT();
  return (
    <>
      <Section title={t("Privacy")}><PrivacyRow /></Section>
      <Section title={t("Backup & restore")} subtitle={t("Portable preferences, without accounts or configured services. Private lists, library references and viewing activity are optional.")}>
        <AutomaticBackups />
        <SettingsRecoverRow />
        <BackupRow />
      </Section>
    </>
  );
}
export function MacDownloadsPanel() {
  const t = useT();
  const { setView } = useView();
  return (
    <div className="flex flex-col gap-4">
      <DownloadDirBar />
      <div>
        <button type="button" className="mac-secondary-button" onClick={() => setView("downloads")}>
          {t("Open downloads")}
          <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
        </button>
      </div>
    </div>
  );
}
