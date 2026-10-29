import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, Link2, Loader2, Search, Settings2, X } from "lucide-react";
import { AddonLogo } from "@/components/addon-logo";
import { isAddonEnabled, manifestRequiresConfiguration, setAddonEnabled } from "@/lib/addon-store";
import type { AddonCategory, AddonTag } from "@/lib/addons-store/curated";
import { categorizeAddon, type ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { addonKey, idOf, nameOf, subtitleFromManifest } from "@/views/addons/addons-utils";
import { MacAddonsImport } from "./mac-addons-import";

// The addons page on a phone, organised by what an addon is for rather than by
// catalogue: is VAYRA ready to play, then recommended sources, subtitles and
// catalogues, one field to search or paste a link, and what is installed.
// Rendered from AddonsView, which keeps the data, install flows and modals.

type Section = { id: string; categories: string[]; title: string; blurb: string };

const SECTIONS: Section[] = [
  { id: "streams", categories: ["streams"], title: "Playback sources", blurb: "Where VAYRA finds the files to play. You need at least one." },
  { id: "subtitles", categories: ["subtitles"], title: "Subtitles", blurb: "Subtitles in your languages, searched across providers." },
  { id: "metadata", categories: ["metadata"], title: "Catalogs", blurb: "More rows to browse, better posters and ratings." },
  { id: "anime", categories: ["anime"], title: "nav.anime", blurb: "Anime catalogs and sources that know their seasons." },
  { id: "live", categories: ["sports", "live-tv"], title: "Sports & live TV", blurb: "Live channels and matches." },
  { id: "tools", categories: ["tools"], title: "Extras", blurb: "Sync, ratings, trailers." },
];

const SECTION_PREVIEW = 4;

const TAG_LABELS: Partial<Record<AddonTag, string>> = {
  "debrid-required": "Debrid",
  free: "Free",
  official: "Official",
  configurable: "Needs setup",
};

/** Installed, enabled addons that can find something to play. */
export function playbackSourceCount(installed: ResolvedAddon[], enabled: (url: string) => boolean = isAddonEnabled): number {
  return installed.filter((r) => categorizeAddon(r) === "streams" && enabled(r.transportUrl)).length;
}

/** Curated addons for a section, most recommended first; adult ones never. */
export function sectionAddons(all: ResolvedAddon[], categories: string[]): ResolvedAddon[] {
  return all
    .filter((r) => r.curated && !r.curated.nsfw && categories.includes(r.curated.category as AddonCategory))
    .sort((a, b) => (b.curated?.recommended ?? 0) - (a.curated?.recommended ?? 0));
}

function looksLikeAddonLink(value: string): boolean {
  return /^(https?|stremio):\/\//i.test(value.trim());
}

export function MobileAddons({
  allAddons,
  installed,
  loading,
  onOpen,
  onInstall,
  onInstallUrl,
  onManage,
}: {
  allAddons: ResolvedAddon[];
  installed: ResolvedAddon[];
  loading: boolean;
  onOpen: (id: string) => void;
  onInstall: (r: ResolvedAddon) => Promise<void>;
  onInstallUrl: (url: string) => Promise<string | null>;
  onManage: (r: ResolvedAddon) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"recommended" | "installed">("recommended");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const link = looksLikeAddonLink(query);
  const sources = playbackSourceCount(installed);

  const matches = useMemo(() => {
    if (!q || link) return [];
    const pool = tab === "installed" ? installed : allAddons;
    return pool.filter((r) => `${nameOf(r)} ${r.manifest?.description ?? ""} ${idOf(r)}`.toLowerCase().includes(q)).slice(0, 30);
  }, [q, link, tab, installed, allAddons]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))]">
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="type-title-1 font-semibold leading-tight tracking-[-0.02em] text-ink">{t("nav.addons")}</h1>
          <p className="type-callout leading-snug text-ink-muted">{t("Addons tell VAYRA where to find what you play, subtitles and catalogs.")}</p>
        </div>

        <div role="tablist" className="flex gap-1 rounded-full bg-elevated p-1">
          {(["recommended", "installed"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full type-callout font-semibold transition-colors ${
                tab === id ? "bg-ink text-canvas" : "text-ink-muted"
              }`}
            >
              {id === "recommended" ? t("Recommendations") : t("Installed addons")}
              {id === "installed" && <span className="tabular-nums opacity-70">{installed.length}</span>}
            </button>
          ))}
        </div>

        <MacAddonsImport />

        <label data-search-field className="flex h-11 items-center gap-2.5 rounded-full bg-raised ps-4 pe-1.5">
          {link ? <Link2 size={18} className="shrink-0 text-ink-subtle" /> : <Search size={18} className="shrink-0 text-ink-subtle" />}
          <input
            type="search"
            inputMode="url"
            enterKeyHint="go"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search, or paste an addon link")}
            aria-label={t("Search, or paste an addon link")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent type-body text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("Clear")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle active:bg-elevated"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
        </label>

        {link ? (
          <InstallFromLink url={query.trim()} onInstallUrl={onInstallUrl} onDone={() => setQuery("")} />
        ) : q ? (
          <List
            empty={t("No addon matches that.")}
            items={matches}
            render={(r) => <AddonRow key={addonKey(r)} r={r} onOpen={onOpen} action={<InstallAction r={r} onInstall={onInstall} />} />}
          />
        ) : tab === "recommended" ? (
          <>
            <ReadyCard sources={sources} loading={loading && installed.length === 0} />
            {SECTIONS.map((s) => (
              <RecommendedSection key={s.id} section={s} items={sectionAddons(allAddons, s.categories)} onOpen={onOpen} onInstall={onInstall} />
            ))}
          </>
        ) : installed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-elevated px-5 py-8 text-center">
            <p className="type-body font-semibold text-ink">{t("No addons installed yet")}</p>
            <p className="type-footnote text-ink-muted">{t("Start with a playback source from the recommendations.")}</p>
            <button type="button" onClick={() => setTab("recommended")} className="mt-1 h-10 rounded-full bg-ink px-5 type-callout font-semibold text-canvas">
              {t("See recommendations")}
            </button>
          </div>
        ) : (
          <List
            items={installed}
            render={(r) => <AddonRow key={addonKey(r)} r={r} onOpen={onOpen} action={<InstalledActions r={r} onManage={onManage} />} />}
          />
        )}
      </div>
    </div>
  );
}

function ReadyCard({ sources, loading }: { sources: number; loading: boolean }) {
  const t = useT();
  if (loading) return null;
  if (sources > 0) {
    return (
      <p className="flex items-center gap-2 type-footnote font-medium text-ink-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success">
          <Check size={12} strokeWidth={3} />
        </span>
        {sources === 1 ? t("1 playback source ready") : t("{count} playback sources ready", { count: sources })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-accent-soft p-4 ring-1 ring-accent/30">
      <p className="type-callout font-semibold text-ink">{t("Install a playback source to play")}</p>
      <p className="type-footnote leading-snug text-ink-muted">
        {t("Without one, VAYRA can show titles but has nothing to play. Torrentio with a debrid key, or a free source below.")}
      </p>
    </div>
  );
}

function RecommendedSection({
  section,
  items,
  onOpen,
  onInstall,
}: {
  section: Section;
  items: ResolvedAddon[];
  onOpen: (id: string) => void;
  onInstall: (r: ResolvedAddon) => Promise<void>;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SECTION_PREVIEW);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-title-3 font-semibold tracking-[-0.01em] text-ink">{t(section.title)}</h2>
        <p className="type-footnote text-ink-subtle">{t(section.blurb)}</p>
      </div>
      <div className="flex flex-col divide-y divide-white/6 rounded-2xl bg-elevated">
        {shown.map((r) => (
          <AddonRow key={addonKey(r)} r={r} onOpen={onOpen} action={<InstallAction r={r} onInstall={onInstall} />} />
        ))}
      </div>
      {items.length > SECTION_PREVIEW && (
        <button type="button" onClick={() => setAll(!all)} className="self-start type-footnote font-medium text-ink-muted active:text-ink">
          {all ? t("Show less") : t("Show all {count}", { count: items.length })}
        </button>
      )}
    </section>
  );
}

function List({ items, render, empty }: { items: ResolvedAddon[]; render: (r: ResolvedAddon) => ReactNode; empty?: string }) {
  if (items.length === 0) return empty ? <p className="py-6 text-center type-callout text-ink-muted">{empty}</p> : null;
  return <div className="flex flex-col divide-y divide-white/6 rounded-2xl bg-elevated">{items.map(render)}</div>;
}

function AddonRow({ r, onOpen, action }: { r: ResolvedAddon; onOpen: (id: string) => void; action: ReactNode }) {
  const t = useT();
  const line = r.curated?.hero?.subtitle ?? subtitleFromManifest(r);
  const tags = (r.curated?.tags ?? []).map((tag) => TAG_LABELS[tag]).filter((l): l is string => !!l).slice(0, 2);
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button type="button" onClick={() => onOpen(idOf(r))} className="flex min-w-0 flex-1 items-center gap-3 text-start active:opacity-70">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised">
          <AddonLogo addonId={idOf(r)} addonName={nameOf(r)} manifestLogo={r.manifest?.logo} size="lg" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate type-callout font-semibold text-ink">{nameOf(r)}</span>
          {tags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-raised px-2 py-0.5 type-micro font-semibold text-ink-muted">
                  {t(tag)}
                </span>
              ))}
            </span>
          )}
          {line && <span className="line-clamp-2 type-footnote leading-snug text-ink-subtle">{t(line)}</span>}
        </span>
      </button>
      {action}
    </div>
  );
}

function InstallAction({ r, onInstall }: { r: ResolvedAddon; onInstall: (r: ResolvedAddon) => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (r.installed) {
    return (
      <span aria-label={t("Installed")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check size={16} strokeWidth={2.8} />
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onInstall(r);
        } finally {
          setBusy(false);
        }
      }}
      className="flex h-9 shrink-0 items-center justify-center rounded-full bg-ink px-4 type-footnote font-semibold text-canvas transition-transform active:scale-95 disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : t("Install")}
    </button>
  );
}

function InstalledActions({ r, onManage }: { r: ResolvedAddon; onManage: (r: ResolvedAddon) => void }) {
  const t = useT();
  const [enabled, setEnabled] = useState(() => isAddonEnabled(r.transportUrl));
  const name = nameOf(r);
  return (
    <div className="flex shrink-0 items-center gap-1">
      {manifestRequiresConfiguration(r.manifest ?? undefined) || r.curated?.tags.includes("configurable") ? (
        <button
          type="button"
          onClick={() => onManage(r)}
          aria-label={t("Configure {name}", { name })}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted active:bg-raised"
        >
          <Settings2 size={17} strokeWidth={2} />
        </button>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t("Use {name}", { name })}
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          setAddonEnabled(r.transportUrl, next);
          window.dispatchEvent(new CustomEvent("vayra:addons-changed", { detail: { id: idOf(r), enabled: next } }));
        }}
        className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${enabled ? "bg-accent" : "bg-raised"}`}
      >
        <span
          className={`absolute start-0 top-0.5 h-6 w-6 rounded-full bg-ink shadow transition-transform duration-200 ease-out ${
            enabled ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function InstallFromLink({ url, onInstallUrl, onDone }: { url: string; onInstallUrl: (url: string) => Promise<string | null>; onDone: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const id = await onInstallUrl(url);
        setBusy(false);
        if (id) onDone();
      }}
      className="flex items-center gap-3 rounded-2xl bg-elevated p-4 text-start active:opacity-80 disabled:opacity-60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-callout font-semibold text-ink">{t("Install from this link")}</span>
        <span className="truncate type-footnote text-ink-subtle">{url}</span>
      </span>
      <ChevronRight size={18} className="dir-icon shrink-0 text-ink-subtle" />
    </button>
  );
}
