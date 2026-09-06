import { ArrowUpDown, Settings2 } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { HoverTooltip } from "@/components/hover-tooltip";
import {
  isAddonEnabled,
  manifestRequiresConfiguration,
  setAddonEnabled,
} from "@/lib/addon-store";
import type { ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { addonKey, idOf, nameOf, subtitleFromManifest } from "./addons-utils";
import { AddonDiagnosticButton } from "./diagnostic-button";
import { isMacDesktop } from "@/lib/platform";
import { UninstallAddonButton } from "./uninstall-addon-button";

export function InstalledPane({
  installed,
  search,
  onOpen,
  onUninstall,
  onManage,
  onReorder,
}: {
  installed: ResolvedAddon[];
  search?: string | null;
  onOpen: (id: string) => void;
  onUninstall: (r: ResolvedAddon) => Promise<void>;
  onManage?: (r: ResolvedAddon) => void;
  onReorder?: () => void;
}) {
  const t = useT();
  const paneRef = useRef<HTMLDivElement>(null);
  const q = search?.trim().toLowerCase() ?? "";
  const filtered = q
    ? installed.filter((r) => {
        const name = (r.manifest?.name ?? "").toLowerCase();
        const desc = (r.manifest?.description ?? "").toLowerCase();
        const id = (r.manifest?.id ?? r.curated?.id ?? "").toLowerCase();
        return name.includes(q) || desc.includes(q) || id.includes(q);
      })
    : installed;
  if (installed.length === 0) {
    return (
      <div ref={paneRef} tabIndex={-1} className="rounded-2xl border border-edge-soft bg-elevated/30 p-12 text-center">
        <h3 className="font-display text-[22px] font-medium text-ink">{t("No addons installed yet")}</h3>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] text-ink-muted">
          {t("Head to Discover. Cinemeta and OpenSubtitles cover the basics; Torrentio + a debrid key cover almost everything else.")}
        </p>
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div ref={paneRef} tabIndex={-1} className="rounded-2xl border border-dashed border-edge-soft bg-canvas/30 p-10 text-center">
        <p className="font-display text-[16px] font-medium text-ink">{t("No installed addon matches that.")}</p>
        <p className="mt-1.5 text-[12.5px] text-ink-subtle">
          {t("Clear the search to see all {n} installed.", { n: installed.length })}
        </p>
      </div>
    );
  }
  return (
    <div ref={paneRef} tabIndex={-1} aria-label={t("Installed")} className="flex flex-col gap-3">
      {onReorder && (
        <div className="flex justify-end">
          <button
            onClick={onReorder}
            title={t("Change the order addons are tried in")}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-edge-soft px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-edge hover:text-ink-muted"
          >
            <ArrowUpDown size={13} strokeWidth={2.4} />
            {t("Reorder")}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {filtered.map((r) => (
          <InstalledRow
            key={addonKey(r)}
            resolved={r}
            onOpen={onOpen}
            onUninstall={onUninstall}
            onManage={onManage}
            returnFocusRef={paneRef}
          />
        ))}
      </div>
    </div>
  );
}

function InstalledRow({
  resolved,
  onOpen,
  onUninstall,
  onManage,
  returnFocusRef,
}: {
  resolved: ResolvedAddon;
  onOpen: (id: string) => void;
  onUninstall: (r: ResolvedAddon) => Promise<void>;
  onManage?: (r: ResolvedAddon) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const r = resolved;
  const [enabled, setEnabled] = useState(() => isAddonEnabled(r.transportUrl));
  const isConfigurable = manifestRequiresConfiguration(r.manifest);
  const transportUrl = r.transportUrl;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !enabled;
    setEnabled(next);
    setAddonEnabled(r.transportUrl, next);
    window.dispatchEvent(
      new CustomEvent("vayra:addons-changed", { detail: { id: idOf(r), enabled: next } }),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-edge-soft bg-elevated px-4 py-3 text-start">
      <div className={enabled ? "" : "opacity-45 transition-opacity"}>
        <AddonLogo
          addonId={idOf(r)}
          addonName={nameOf(r)}
          manifestLogo={resolveAddonLogo(r.manifest?.logo, r.transportUrl)}
          size="lg"
        />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${enabled ? "" : "opacity-55"}`}>
        <button type="button" onClick={() => onOpen(idOf(r))} className="truncate text-start text-[14px] font-medium text-ink hover:underline">{nameOf(r)}</button>
        <span className="truncate text-[11.5px] text-ink-subtle">
          {enabled ? subtitleFromManifest(r) : t("Off · catalogs and streams hidden")}
        </span>
        {isMacDesktop() && transportUrl && <AddonDiagnosticButton url={transportUrl} />}
      </div>
      <HoverTooltip
          side="top"
          align="center"
          className="shrink-0"
          label={enabled ? t("Enabled") : t("Disabled")}
          sublabel={enabled ? t("Click to turn off") : t("Click to turn on")}
        >
          <button
            onClick={handleToggle}
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? t("Turn {name} off", { name: nameOf(r) }) : t("Turn {name} on", { name: nameOf(r) })}
            className={`relative h-[22px] w-10 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/50 ${
              enabled ? "bg-accent" : "bg-edge/70 ring-1 ring-inset ring-edge-soft"
            }`}
          >
            <span
              className={`absolute start-[3px] top-[3px] h-4 w-4 rounded-full bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-transform duration-200 ${
                enabled ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0"
              }`}
            />
          </button>
      </HoverTooltip>
      {isConfigurable && transportUrl && onManage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage(r);
          }}
          title={t("Re-configure this addon and apply the updated link")}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-raised px-3.5 py-1.5 text-[12px] font-semibold text-ink-muted ring-1 ring-edge-soft transition-colors hover:bg-elevated hover:text-ink hover:ring-edge"
        >
          <Settings2 size={12} strokeWidth={2.2} />
          {t("Manage")}
        </button>
      )}
      <UninstallAddonButton name={nameOf(r)} onUninstall={() => onUninstall(r)} returnFocusRef={returnFocusRef} />
    </div>
  );
}
