import { useState } from "react";
import { Check, ClipboardCopy, FolderOpen, Loader2 } from "lucide-react";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { torrentEngineStatus } from "@/lib/torrent/local-engine";
import { Section, ToggleRow } from "../shared";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function P2PAdvancedSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const strictRemote = !!settings.remoteStreamServerUrl && settings.remoteStreamServerStrict;
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const copyDiagnostics = async () => {
    const status = await torrentEngineStatus();
    const diag = {
      engine: status,
      directTorrentStream: settings.directTorrentStream,
      p2pAutoConsent: settings.p2pAutoConsent,
      remoteStreamServerUrl: settings.remoteStreamServerUrl || null,
      remoteStreamServerStrict: settings.remoteStreamServerStrict,
      userAgent: navigator.userAgent,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const revealEngineFolder = async () => {
    if (!isTauri) return;
    setOpening(true);
    try {
      await revealItemInDir(await join(await appCacheDir(), "engine"));
    } catch {
      /* folder not created until the engine runs once */
    } finally {
      setOpening(false);
    }
  };

  return (
    <Section
      title={t("Power tools & diagnostics")}
      subtitle={t("Low-level knobs for the peer-to-peer engine, plus quick ways to grab debug info when a stream misbehaves.")}
    >
      <ToggleRow
        label={t("Direct torrent streaming")}
        sub={t("Stream torrents straight from Harbor's built-in engine when you have no debrid set up, or a torrent isn't cached. This connects to peers over your own connection. Turn off to only ever play debrid and direct links.")}
        value={settings.directTorrentStream}
        onChange={(v) => update({ directTorrentStream: v })}
        lockReason={strictRemote ? t("Disabled while strict remote streaming is on") : undefined}
      />
      <ToggleRow
        label={t("Auto-confirm peer-to-peer streaming")}
        sub={t("Skip the 'stream over peer-to-peer?' prompt and start uncached torrents immediately. Harbor remembers your choice after the first confirmation anyway.")}
        value={settings.p2pAutoConsent}
        onChange={(v) => update({ p2pAutoConsent: v })}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void copyDiagnostics()}
          className="flex h-10 items-center gap-2 rounded-lg border border-edge-soft px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
        >
          {copied ? (
            <Check size={14} strokeWidth={2.6} className="text-emerald-400" />
          ) : (
            <ClipboardCopy size={14} strokeWidth={2.2} />
          )}
          {copied ? t("Copied") : t("Copy diagnostics")}
        </button>
        {isTauri && (
          <button
            type="button"
            onClick={() => void revealEngineFolder()}
            disabled={opening}
            className="flex h-10 items-center gap-2 rounded-lg border border-edge-soft px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink disabled:opacity-60"
          >
            {opening ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FolderOpen size={14} strokeWidth={2.2} />
            )}
            {t("Reveal engine folder")}
          </button>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-subtle">
        {t("Copy diagnostics grabs the engine status and your P2P settings as JSON, handy to paste into a bug report. The engine folder holds the DHT cache (dht.json) and active torrent data.")}
      </p>
    </Section>
  );
}
