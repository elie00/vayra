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

export function MacConnectionsPanel() {
  const t = useT();
  const { setActive } = useSettingsActiveContext();
  const { setView } = useView();
  return <>
    <Section title={t("Extensions")} subtitle={t("Install, configure and manage your content sources in one place.")}>
      <button className="mac-primary-button" onClick={() => setView("addons")}>{t("Manage extensions")}</button>
    </Section>
    <Section title={t("Optional connections")} subtitle={t("Your VAYRA account is independent. Connect only the services you use.")}>
      {MAC_SETTINGS_GROUPS.find((g) => g.id === "connections")!.children.map((id) => {
        const item = NAV_GROUPS.flatMap((g) => g.items).find((it) => it.id === id);
        return item && <button key={id} type="button" onClick={() => setActive(id)} className="mac-secondary-button text-start">{t(item.label)}</button>;
      })}
    </Section>
  </>;
}
export function MacPrivacyPanel() {
  const t = useT();
  return <><Section title={t("Privacy")}><PrivacyRow /></Section><Section title={t("Backup & restore")} subtitle={t("Export your VAYRA setup to a single file. Sign-ins and private LUMA activity stay out unless you explicitly include LUMA.")}><AutomaticBackups /><SettingsRecoverRow /><BackupRow /></Section></>;
}
export function MacDownloadsPanel() {
  const t = useT();
  const { setView } = useView();
  return <><DownloadDirBar /><button type="button" className="mac-secondary-button" onClick={() => setView("downloads")}>{t("Open downloads")}</button></>;
}
