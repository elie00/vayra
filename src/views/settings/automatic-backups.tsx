import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import { checkpointPatch, readSettingsHistory, recordSettingsCheckpoint, type SettingsCheckpoint } from "@/lib/settings/history";
import { getUiLanguage, useT } from "@/lib/i18n";

export function AutomaticBackups() {
  const t = useT();
  const { settings, update } = useSettings();
  const [history, setHistory] = useState<SettingsCheckpoint[]>([]);
  const [selected, setSelected] = useState<SettingsCheckpoint | null>(null);
  const [error, setError] = useState(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void readSettingsHistory().then((value) => { if (live) setHistory(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  const patch = selected ? checkpointPatch(selected, settings) : {};
  const changes = Object.keys(patch).filter((key) => JSON.stringify(patch[key as keyof typeof patch]) !== JSON.stringify(settings[key as keyof typeof settings]));
  const groups = [...new Set(changes.map((key) => /Lang|uiLanguage/.test(key) ? "Language preferences" : /theme|Scale|Radius|sidebar|Pinned/.test(key) ? "Appearance preferences" : /download/.test(key) ? "Download preferences" : "Playback preferences"))];
  const restore = async () => {
    setBusy(true); setError(false);
    await recordSettingsCheckpoint(settings);
    if (localStorage.getItem("vayra.settings.history.error")) { setError(true); setBusy(false); return; }
    update(patch); setSelected(null); setRestored(true); setBusy(false);
  };
  return <section className="mb-5 rounded-2xl bg-elevated p-5" aria-label={t("Automatic local backups")}>
    <h3 className="text-[17px] font-semibold text-ink">{t("Automatic local backups")}</h3>
    <p className="mt-2 text-[13px] text-ink-muted">{t("Keeps five previous versions of your language, playback and appearance preferences. Accounts, keys, configured links and viewing history are excluded.")}</p>
    {!history.length && !error && <p className="mt-3 text-[13px] text-ink-muted">{t("Previous versions will appear after you change these preferences.")}</p>}
    <div className="mt-4 flex flex-col gap-2">{history.map((entry, index) => <button key={`${entry.savedAt}:${index}`} className="mac-secondary-button justify-between text-start" onClick={() => { setSelected(entry); setRestored(false); }}><span>{new Date(entry.savedAt).toLocaleString(getUiLanguage())}</span><span>{t("Preview restore")}</span></button>)}</div>
    {selected && <div className="mt-4 rounded-xl bg-canvas p-4">
      <h4 className="font-semibold text-ink">{t("Restore preview")}</h4>
      <p className="mt-2 text-[13px] text-ink-muted">{groups.length ? groups.map((group) => t(group)).join(" · ") : t("These preferences are already identical.")}</p>
      <p className="mt-2 text-[12px] text-ink-subtle">{t("Your current preferences are saved before restoring. Your accounts and downloaded files are not changed.")}</p>
      <div className="mt-3 flex gap-2"><button disabled={busy || !changes.length} className="mac-primary-button disabled:opacity-50" onClick={() => void restore()}>{t("Restore these preferences")}</button><button className="mac-secondary-button" onClick={() => setSelected(null)}>{t("Cancel")}</button></div>
    </div>}
    {error && <p role="alert" className="mt-3 text-[13px] text-danger">{t("Local backups are unavailable. No preferences were restored.")}</p>}
    {restored && <p role="status" className="mt-3 text-[13px] text-ink">{t("Preferences restored. Your accounts are unchanged.")}</p>}
  </section>;
}
