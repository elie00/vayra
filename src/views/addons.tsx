import { Check, ChevronRight, Library, Sparkles, Star, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgeGateModal } from "@/components/age-gate-modal";
import { HarborLoader } from "@/components/harbor-loader";
import { useScrollMemory, useView } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { AddonsMosaicBackdrop } from "@/components/addons-mosaic-backdrop";
import { CURATED_RAILS, heroEntry } from "@/lib/addons-store/curated";
import { useAddonsCatalog, buildRail, type ResolvedAddon } from "@/lib/addons-store/store";
import { useCategories } from "@/lib/providers/stremio-addons";
import { prefetchTopAddonLogos } from "@/lib/providers/addon-logo-prefetch";
import { relatedAddons, recommendedAddons } from "@/lib/addons-store/recommend";
import { fetchManifestAt, installAddon, installFromUrl, uninstallAddon } from "@/lib/addon-store";
import { useAuth } from "@/lib/auth";
import streamsIcon from "@/assets/category/streams.svg";
import catalogsIcon from "@/assets/category/catalogs.svg";
import subtitlesIcon from "@/assets/category/subtitles.svg";
import animeIcon from "@/assets/category/anime.svg";
import sportsIcon from "@/assets/category/sports.svg";
import livetvIcon from "@/assets/category/livetv.svg";
import toolsIcon from "@/assets/category/tools.svg";
import adultIcon from "@/assets/category/adult.svg";
import { AddByUrlBar } from "./addons/add-by-url-bar";
import { AddonDetail } from "./addons/addon-detail";
import { AddonInstallModal } from "./addons/install-modal";
import { consumeAddonsTab, type Tab, type ToastInfo } from "./addons/addons-types";
import { BrowsePane } from "./addons/browse-pane";
import { DiscoverPane } from "./addons/discover-pane";
import { InstalledPane } from "./addons/installed-pane";
import { SearchBar } from "./addons/search-bar";
import { Toaster } from "./addons/toaster";

export { requestAddonsTab } from "./addons/addons-types";

void streamsIcon;
void catalogsIcon;
void subtitlesIcon;
void animeIcon;
void sportsIcon;
void livetvIcon;
void toolsIcon;
void adultIcon;

type BrowseModeId = "top" | "new";

const BROWSE_MODES: Array<{
  id: BrowseModeId;
  label: string;
  sub: string;
  Icon: typeof Star;
}> = [
  { id: "top", label: "Top rated", sub: "By community stars", Icon: Star },
  { id: "new", label: "Just added", sub: "Freshest on stremio-addons.net", Icon: Sparkles },
];

void TrendingUp;

void Library;

export function AddonsView() {
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const { byId, installedIds, loading, refetch } = useAddonsCatalog(settings.showAdultAddons);
  const { addonDetailId, openAddonDetail, goBack } = useView();
  const [tab, setTab] = useState<Tab>(() => consumeAddonsTab() ?? "discover");

  useEffect(() => {
    const requested = consumeAddonsTab();
    if (requested) setTab(requested);
    void prefetchTopAddonLogos();
    void import("@/lib/providers/stremio-addons-index").then((m) =>
      m.ensureCommunityIndex().catch(() => undefined),
    );
  }, []);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseModeId>("top");
  const saCategories = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollMemory("addons", scrollRef);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, categoryFilter]);
  useEffect(() => {
    if (!settings.showAdultAddons && categoryFilter === "nsfw") setCategoryFilter(null);
  }, [settings.showAdultAddons, categoryFilter]);
  const [query, setQuery] = useState("");
  const goToCategory = (cat: string) => {
    setCategoryFilter(cat);
    setTab("browse");
  };
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [installModal, setInstallModal] = useState<
    | { kind: "install"; url: string }
    | { kind: "manage"; existing: { id: string; name: string; logo?: string | null; transportUrl: string } }
    | null
  >(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void import("@/lib/deep-link").then(({ onDeepLinkInstall, consumePendingDeepLink, clearPendingDeepLink }) => {
      const pending = consumePendingDeepLink();
      if (pending && !window.__harborInstallerOpen) {
        setInstallModal({ kind: "install", url: pending });
      }
      unlisten = onDeepLinkInstall((rawUrl) => {
        if (window.__harborInstallerOpen) return;
        clearPendingDeepLink();
        setInstallModal({ kind: "install", url: rawUrl });
      });
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onChange = () => refetch();
    window.addEventListener("harbor:addons-changed", onChange);
    return () => window.removeEventListener("harbor:addons-changed", onChange);
  }, [refetch]);

  const showToast = (
    kind: "ok" | "error",
    text: string,
    addon?: { id: string; name: string; logo?: string | null },
  ) => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    setToast({ kind, text, addon });
    toastTimerRef.current = window.setTimeout(() => setToast(null), kind === "error" ? 5000 : 3000);
  };
  useEffect(() => () => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const hero = useMemo(() => {
    const h = heroEntry();
    if (!h) return null;
    const r = byId.get(h.id);
    return r ? { entry: h, resolved: r } : null;
  }, [byId]);

  const railsData = useMemo(
    () =>
      CURATED_RAILS.map((rail) => ({
        rail,
        items: buildRail(byId, rail.id, 16),
      })).filter((r) => r.items.length > 0),
    [byId],
  );

  const allAddons = useMemo(() => [...byId.values()], [byId]);

  const installed = useMemo(() => allAddons.filter((r) => r.installed), [allAddons]);
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (trimmedQuery.length > 0 && tab !== "installed") setTab("browse");
  }, [trimmedQuery, tab]);

  const onInstall = async (r: ResolvedAddon) => {
    try {
      let manifest = r.manifest ?? null;
      if (!manifest?.behaviorHints) {
        manifest = await fetchManifestAt(r.transportUrl).catch(() => manifest);
      }
      const hints = manifest?.behaviorHints;
      if (hints?.configurable === true || hints?.configurationRequired === true) {
        openAddonDetail(manifest?.id ?? r.manifest?.id ?? r.curated?.id ?? r.transportUrl);
        return;
      }
      const addon = await installAddon(manifest?.id ?? r.manifest?.id ?? r.curated?.id ?? "", r.transportUrl);
      window.dispatchEvent(
        new CustomEvent("harbor:addons-changed", {
          detail: { id: addon.manifest.id, installed: true },
        }),
      );
      refetch();
      showToast("ok", `Installed`, {
        id: addon.manifest.id,
        name: addon.manifest.name,
        logo: addon.manifest.logo ?? r.manifest?.logo ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Install failed.";
      console.warn("[addons] install failed", e);
      showToast("error", msg);
    }
  };
  const onInstallUrl = async (rawUrl: string): Promise<string | null> => {
    try {
      const result = await installFromUrl(rawUrl);
      window.dispatchEvent(
        new CustomEvent("harbor:addons-changed", {
          detail: { id: result.addon.manifest.id, installed: true },
        }),
      );
      refetch();
      showToast(
        "ok",
        result.replaced
          ? "Updated"
          : result.syncedToStremio
            ? "Installed"
            : "Installed locally",
        {
          id: result.addon.manifest.id,
          name: result.addon.manifest.name,
          logo: result.addon.manifest.logo ?? null,
        },
      );
      return result.addon.manifest.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Install failed.";
      console.warn("[addons] installFromUrl failed", e);
      showToast("error", msg);
      return null;
    }
  };
  const onUninstall = async (r: ResolvedAddon) => {
    const id = r.manifest?.id ?? r.curated?.id;
    if (!id) return;
    try {
      await uninstallAddon(id, r.transportUrl);
      window.dispatchEvent(
        new CustomEvent("harbor:addons-changed", {
          detail: { id, installed: false },
        }),
      );
      refetch();
      showToast("ok", "Removed", {
        id,
        name: r.manifest?.name ?? id,
        logo: r.manifest?.logo ?? null,
      });
    } catch (e) {
      console.warn("[addons] uninstall failed", e);
      showToast("error", "Couldn't remove. Try again.");
    }
  };

  if (addonDetailId) {
    const local = byId.get(addonDetailId);
    return (
      <RemoteOrLocalDetail
        addonDetailId={addonDetailId}
        local={local}
        installedIds={installedIds}
        allAddons={allAddons}
        onOpen={openAddonDetail}
        onInstall={onInstall}
        onUninstall={onUninstall}
        onInstallUrl={onInstallUrl}
        showToast={showToast}
        onCancel={goBack}
        toast={toast}
      />
    );
  }

  return (
    <main className="relative flex h-full flex-col overflow-hidden">
      {tab === "discover" && <AddonsMosaicBackdrop />}
      <AgeGateModal
        open={ageGateOpen}
        onClose={() => setAgeGateOpen(false)}
        onPass={() => update({ showAdultAddons: true })}
      />
      <header className="shrink-0 px-12 pt-20 pb-3">
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-1">
            {(["discover", "browse", "installed"] as Tab[]).map((t) => {
              const active = tab === t;
              if (t === "installed") {
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex h-12 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors ${
                      active
                        ? "bg-ink text-canvas"
                        : "text-ink-muted hover:bg-elevated hover:text-ink"
                    }`}
                  >
                    <Check size={15} strokeWidth={2.6} className={active ? "" : "text-accent"} />
                    <span>Installed</span>
                    <span
                      className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums ${
                        active ? "bg-canvas/15 text-canvas" : "bg-edge text-ink-muted"
                      }`}
                    >
                      {installedIds.size}
                    </span>
                  </button>
                );
              }
              const btn = (
                <button
                  onClick={() => {
                    setTab(t);
                    if (t === "browse") setCategoryFilter(null);
                  }}
                  className={`flex h-12 items-center rounded-full px-5 text-[14px] font-semibold capitalize transition-colors ${
                    active
                      ? "bg-ink text-canvas"
                      : "text-ink-muted hover:bg-elevated hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              );
              if (t === "discover") {
                return (
                  <div key={t} className="group relative">
                    {btn}
                    <div className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-edge-soft bg-elevated/95 px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted opacity-0 shadow-xl backdrop-blur-md transition duration-150 group-hover:visible group-hover:opacity-100">
                      Curated for popularity and reliability. No paid placements. Install anything
                      else by URL on the Browse tab.
                    </div>
                  </div>
                );
              }
              return <span key={t}>{btn}</span>;
            })}
          </nav>
          <div className="flex flex-1 items-center gap-3">
            <SearchBar value={query} onChange={setQuery} />
            <div className="flex-1">
              <AddByUrlBar onSubmit={async (raw) => { setInstallModal({ kind: "install", url: raw }); }} compact />
            </div>
            <button
              onClick={() => {
                if (settings.showAdultAddons) {
                  update({ showAdultAddons: false });
                } else {
                  setAgeGateOpen(true);
                }
              }}
              title={settings.showAdultAddons ? "Hide adult addons" : "Show adult addons"}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                settings.showAdultAddons
                  ? "border-ink bg-ink/10 text-ink"
                  : "border-edge-soft text-ink-subtle hover:border-edge hover:text-ink-muted"
              }`}
            >
              <span
                className={`flex h-3 w-3 items-center justify-center rounded-sm border ${
                  settings.showAdultAddons ? "border-ink bg-ink" : "border-edge"
                }`}
              >
                {settings.showAdultAddons && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" className="text-canvas">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span>Adult</span>
            </button>
            {tab === "browse" && (
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-edge-soft px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-edge hover:text-ink-muted"
              >
                <ChevronRight
                  size={13}
                  strokeWidth={2.4}
                  className={`transition-transform duration-300 ${filtersOpen ? "rotate-90" : "-rotate-90"}`}
                />
                {filtersOpen ? "Hide" : "Filters"}
              </button>
            )}
          </div>
        </div>
        {tab === "browse" && (
          <div
            className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              filtersOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors ${
                    categoryFilter == null
                      ? "bg-ink text-canvas"
                      : "bg-elevated/40 text-ink-muted ring-1 ring-edge-soft/60 hover:bg-elevated/70 hover:text-ink"
                  }`}
                >
                  All
                </button>
                {saCategories.filter((c) => settings.showAdultAddons || c.slug !== "nsfw").map((c) => {
                  const active = categoryFilter === c.slug;
                  return (
                    <button
                      key={c.slug}
                      onClick={() => setCategoryFilter(c.slug)}
                      className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors ${
                        active
                          ? "bg-ink text-canvas"
                          : "bg-elevated/40 text-ink-muted ring-1 ring-edge-soft/60 hover:bg-elevated/70 hover:text-ink"
                      }`}
                    >
                      <span>{c.name}</span>
                    </button>
                  );
                })}
                <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-edge-soft" />
                {BROWSE_MODES.map((m) => {
                  const active = browseMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setBrowseMode(m.id)}
                      title={m.sub}
                      className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                        active
                          ? "bg-ink text-canvas"
                          : "bg-elevated/40 text-ink-muted ring-1 ring-edge-soft/60 hover:bg-elevated/70 hover:text-ink"
                      }`}
                    >
                      <m.Icon size={13} strokeWidth={2.4} className={active ? "" : "text-accent"} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-12 pb-20 pt-6">
        {loading && allAddons.length === 0 ? (
          <div className="flex h-full items-center justify-center py-24">
            <HarborLoader size="lg" caption="Loading the catalog" keyed />
          </div>
        ) : tab === "discover" ? (
          <DiscoverPane
            hero={hero}
            rails={railsData}
            installedIds={installedIds}
            onOpen={openAddonDetail}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onCategorySelect={goToCategory}
            authKey={authKey}
            onRefetch={refetch}
          />
        ) : tab === "browse" ? (
          <BrowsePane
            mode={browseMode}
            category={trimmedQuery ? null : categoryFilter}
            search={trimmedQuery || null}
            allowAdult={settings.showAdultAddons}
            installedIds={installedIds}
            onOpen={openAddonDetail}
            onRefetch={refetch}
          />
        ) : (
          <InstalledPane
            installed={installed}
            search={trimmedQuery || null}
            onOpen={openAddonDetail}
            onUninstall={onUninstall}
            onManage={(r) => {
              const id = r.manifest?.id ?? r.curated?.id;
              if (!id) return;
              setInstallModal({
                kind: "manage",
                existing: {
                  id,
                  name: r.manifest?.name ?? id,
                  logo: r.manifest?.logo ?? null,
                  transportUrl: r.transportUrl,
                },
              });
            }}
          />
        )}
      </div>
      <Toaster toast={toast} />
      {installModal && (
        <AddonInstallModal
          mode={installModal}
          onClose={() => setInstallModal(null)}
          onInstall={async (rawUrl, opts) => {
            try {
              const result = await installFromUrl(rawUrl, opts);
              refetch();
              showToast(
                "ok",
                result.replaced ? "Updated" : result.syncedToStremio ? "Installed" : "Installed locally",
                {
                  id: result.addon.manifest.id,
                  name: result.addon.manifest.name,
                  logo: result.addon.manifest.logo ?? null,
                },
              );
              return { replaced: result.replaced, addon: result.addon };
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Install failed.";
              showToast("error", msg);
              return null;
            }
          }}
        />
      )}
    </main>
  );
}

function RemoteOrLocalDetail({
  addonDetailId,
  local,
  installedIds,
  allAddons,
  onOpen,
  onInstall,
  onUninstall,
  onInstallUrl,
  showToast,
  onCancel,
  toast,
}: {
  addonDetailId: string;
  local: ResolvedAddon | undefined;
  installedIds: Set<string>;
  allAddons: ResolvedAddon[];
  onOpen: (id: string) => void;
  onInstall: (r: ResolvedAddon) => Promise<void>;
  onUninstall: (r: ResolvedAddon) => Promise<void>;
  onInstallUrl: (rawUrl: string) => Promise<string | null>;
  showToast: (kind: "ok" | "error", text: string) => void;
  onCancel: () => void;
  toast: ToastInfo | null;
}) {
  const [remote, setRemote] = useState<ResolvedAddon | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (local) return;
    let cancelled = false;
    setRemote(null);
    setFailed(false);
    (async () => {
      const { communityFor, ensureCommunityIndex } = await import(
        "@/lib/providers/stremio-addons-index"
      );
      await ensureCommunityIndex().catch(() => undefined);
      const community = communityFor(addonDetailId);
      if (!community) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { getAddon } = await import("@/lib/providers/stremio-addons");
      try {
        const d = await getAddon(community.slug);
        if (cancelled) return;
        const synthetic: ResolvedAddon = {
          manifest: d.manifest as ResolvedAddon["manifest"],
          transportUrl: d.manifestUrl,
          source: "community",
          installed: installedIds.has(addonDetailId),
        };
        setRemote(synthetic);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addonDetailId, local, installedIds]);

  useEffect(() => {
    if (!local && failed) onCancel();
  }, [local, failed, onCancel]);

  const resolved = local ?? remote;
  const recs = useMemo(() => {
    if (!resolved) return { related: [] as ResolvedAddon[], recommended: [] as ResolvedAddon[] };
    const related = relatedAddons(resolved, allAddons, 8);
    const exclude = new Set(
      related.map((r) => r.manifest?.id ?? r.curated?.id ?? r.transportUrl),
    );
    exclude.add(addonDetailId);
    const recommended = recommendedAddons(resolved, allAddons, installedIds, exclude, 8);
    return { related, recommended };
  }, [resolved, allAddons, installedIds, addonDetailId]);
  if (!resolved) {
    return (
      <main className="flex h-full items-center justify-center bg-canvas">
        <HarborLoader />
      </main>
    );
  }
  return (
    <>
      <AddonDetail
        resolved={resolved}
        related={recs.related}
        recommended={recs.recommended}
        installedIds={installedIds}
        onOpen={onOpen}
        onInstall={() => onInstall(resolved)}
        onInstallAddon={onInstall}
        onUninstall={() => onUninstall(resolved)}
        onInstallUrl={onInstallUrl}
        showToast={showToast}
      />
      <Toaster toast={toast} />
    </>
  );
}
