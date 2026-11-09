import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { installFromUrl, loadInstalled } from "@/lib/addon-store";
import type { ConnectAddon } from "@/lib/connect/host";
import { useLinkStatus } from "@/lib/connect/link";
import { useT } from "@/lib/i18n";

/** The Mac's addons this phone does not have yet, by install address. */
export function missingAddons(mac: ConnectAddon[], installedUrls: Set<string>): ConnectAddon[] {
  return mac.filter((a) => !installedUrls.has(a.transportUrl));
}

const installedUrls = () => new Set(loadInstalled().map((a) => a.transportUrl));

/**
 * Offers the paired Mac's addons that this phone lacks, sent over VAYRA Connect,
 * so the phone plays from the same sources without a Stremio account. Each one
 * goes through the usual install, with its checks.
 */
export function MacAddonsImport() {
  const t = useT();
  const { mac, addons } = useLinkStatus();
  const [have, setHave] = useState(installedUrls);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: number; failed: number } | null>(null);

  useEffect(() => {
    const refresh = () => setHave(installedUrls());
    window.addEventListener("vayra:addons-changed", refresh);
    return () => window.removeEventListener("vayra:addons-changed", refresh);
  }, []);

  if (!mac || !addons) return null;
  const missing = missingAddons(addons, have);
  if (missing.length === 0 && !done) return null;

  const importAll = async () => {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const addon of missing) {
      try {
        const result = await installFromUrl(addon.transportUrl);
        ok += 1;
        window.dispatchEvent(new CustomEvent("vayra:addons-changed", { detail: { id: result.addon.manifest.id, installed: true } }));
      } catch {
        failed += 1;
      }
    }
    setHave(installedUrls());
    setDone({ ok, failed });
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-elevated p-4 ring-1 ring-edge-soft/50">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Laptop size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-callout font-semibold text-ink">{t("Addons from {name}", { name: mac.name })}</p>
          <p className="type-footnote text-ink-muted">
            {done
              ? done.failed > 0
                ? t("{ok} imported, {failed} could not be installed.", { ok: done.ok, failed: done.failed })
                : t("{ok} imported. This phone now plays from the same sources.", { ok: done.ok })
              : t("{count} installed on the Mac are not on this phone yet.", { count: missing.length })}
          </p>
        </div>
      </div>
      {missing.length > 0 && (
        <>
          <p className="line-clamp-2 type-footnote text-ink-subtle">{missing.map((a) => a.name || a.transportUrl).join(" · ")}</p>
          <button
            type="button"
            onClick={() => void importAll()}
            disabled={busy}
            className="flex h-11 items-center justify-center rounded-full bg-ink type-callout font-semibold text-canvas transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {busy ? t("Importing…") : t("Import {count} addons", { count: missing.length })}
          </button>
        </>
      )}
    </section>
  );
}
