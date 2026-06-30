import { Filter, Languages, MousePointerClick, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { resolveAddonLogo } from "@/components/addon-logo";
import { HostSourceBanner } from "@/components/host-source-banner";
import { Tooltip } from "./transport/tooltip";
import { fetchInstalledAddons } from "@/lib/addon-store";
import { userAddons, type Addon } from "@/lib/addons";
import { useAuth } from "@/lib/auth";
import { peekPickerCache, subscribePickerCache } from "@/lib/picker-cache";
import { useSettings } from "@/lib/settings";
import type { ScoredStream } from "@/lib/streams/types";
import type { SourceDescriptor } from "@/lib/together/protocol";
import { buildMatchScores, matchBadge } from "@/lib/together/source-match";
import { addonInstanceKey, buildAddonOptions } from "@/views/play-picker/picker-utils";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { useActiveKid } from "@/lib/profiles";
import { AddonFilterMenu, QualityFilterMenu } from "./stream-switcher/filter-dropdowns";
import { KidsStreamSwitcher } from "./stream-switcher/kids-switcher";
import { abbreviateLanguages, normalizeLangCode, streamMatchesLangs } from "./stream-switcher/lang-utils";
import { QUALITY_BADGE, QUALITY_LABEL, QUALITY_ORDER, qualityKey, type QualityKey } from "./stream-switcher/quality";
import { streamKey, SwitcherRow } from "./stream-switcher/switcher-row";

function isHiddenAddon(addonId: string, addonName?: string): boolean {
  const id = (addonId || "").toLowerCase();
  const name = (addonName || "").toLowerCase();
  return id.includes("watchhub") || name.includes("watchhub");
}

export function StreamSwitcher({
  open,
  onClose,
  onPick,
  resolvingKey,
  currentUrl,
  debridSlugs,
  meta,
  episode,
  hostSource,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (stream: ScoredStream) => void;
  resolvingKey: string | null;
  currentUrl: string;
  debridSlugs: string[];
  meta: Meta;
  episode?: PlayEpisode;
  hostSource?: SourceDescriptor | null;
}) {
  const t = useT();
  const kid = useActiveKid();
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const baseLangs = settings.preferredLanguages ?? [];
  const isAnimeRequest =
    typeof meta.id === "string" && (meta.id.startsWith("kitsu:") || meta.id.startsWith("mal:"));
  const preferredLangs = useMemo(() => {
    const codes = settings.preferredAudioLangs ?? [];
    const animeAdd = isAnimeRequest ? ["Japanese"] : [];
    const all = [...baseLangs, ...codes, ...animeAdd];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const lang of all) {
      const code = normalizeLangCode(lang);
      if (!isAnimeRequest && code === "ja") continue;
      if (seen.has(code)) continue;
      seen.add(code);
      out.push(lang);
    }
    return out;
  }, [baseLangs, settings.preferredAudioLangs, isAnimeRequest]);
  const [cache, setCache] = useState(() => peekPickerCache(meta, episode));
  const [addonLogos, setAddonLogos] = useState<Map<string, string | null>>(new Map());
  const [addonRank, setAddonRank] = useState<Map<string, number>>(new Map());
  const [filterToPreferred, setFilterToPreferred] = useState(
    settings.requirePreferredLanguage === true && preferredLangs.length > 0,
  );

  useEffect(
    () => subscribePickerCache(() => setCache(peekPickerCache(meta, episode))),
    [meta, episode],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const installed = await fetchInstalledAddons().catch(() => [] as Addon[]);
      const stremio = authKey ? await userAddons(authKey).catch(() => [] as Addon[]) : [];
      if (cancelled) return;
      const m = new Map<string, string | null>();
      const r = new Map<string, number>();
      const merged = [...installed, ...stremio];
      const seenId = new Set<string>();
      let idx = 0;
      for (const a of merged) {
        const id = a.manifest?.id;
        if (!id) continue;
        if (!seenId.has(id)) {
          seenId.add(id);
          r.set(id, idx++);
        }
        m.set(id, resolveAddonLogo(a.manifest.logo, a.transportUrl));
      }
      setAddonLogos(m);
      setAddonRank(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const keptStreams = useMemo<ScoredStream[]>(() => cache?.result.picker.all ?? [], [cache]);
  const rejectedStreams = useMemo<ScoredStream[]>(
    () =>
      (cache?.result.rejected ?? []).map((r) => ({
        ...r.stream,
        score: 0,
        reasons: [{ signal: `filtered:${r.reason}`, delta: 0 }],
        tier: "ROUGH" as const,
      })),
    [cache],
  );
  const [showFiltered, setShowFiltered] = useState(false);
  const allStreams = useMemo<ScoredStream[]>(
    () => (showFiltered ? [...keptStreams, ...rejectedStreams] : keptStreams),
    [keptStreams, rejectedStreams, showFiltered],
  );
  const cachedStreams = useMemo(
    () =>
      allStreams.filter(
        (s) =>
          s.url != null ||
          debridSlugs.some(
            (slug) => s.cached[slug as keyof typeof s.cached] || s.inLibrary[slug as keyof typeof s.inLibrary],
          ),
      ),
    [allStreams, debridSlugs],
  );
  const [cachedOnly, setCachedOnly] = useState(false);
  const baseList = cachedOnly && debridSlugs.length > 0 && cachedStreams.length > 0 ? cachedStreams : allStreams;
  const [addonFilter, setAddonFilter] = useState<string>("all");
  const [addonMenuOpen, setAddonMenuOpen] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<QualityKey>("all");
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const qualityOptions = useMemo(() => {
    const counts = new Map<Exclude<QualityKey, "all">, number>();
    for (const s of allStreams) {
      const k = qualityKey(s);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return QUALITY_ORDER.filter((q) => (counts.get(q) ?? 0) > 0).map((q) => ({
      id: q,
      name: QUALITY_LABEL[q],
      count: counts.get(q) ?? 0,
      badge: QUALITY_BADGE[q],
    }));
  }, [allStreams]);
  useEffect(() => {
    if (qualityFilter !== "all" && !qualityOptions.some((o) => o.id === qualityFilter)) {
      setQualityFilter("all");
    }
  }, [qualityOptions, qualityFilter]);
  const addonOptions = useMemo(() => buildAddonOptions(allStreams), [allStreams]);
  useEffect(() => {
    if (addonFilter !== "all" && !addonOptions.some((o) => o.id === addonFilter)) {
      setAddonFilter("all");
    }
  }, [addonOptions, addonFilter]);
  const matchScores = useMemo(
    () => (hostSource ? buildMatchScores(allStreams, hostSource) : null),
    [allStreams, hostSource],
  );
  const addonFilteredList = useMemo(() => {
    let list: ScoredStream[];
    if (addonFilter !== "all") {
      list = baseList.filter((s) => addonInstanceKey(s) === addonFilter);
    } else {
      list = baseList.filter((s) => !isHiddenAddon(s.addonId, s.addonName));
    }
    if (qualityFilter !== "all") {
      list = list.filter((s) => qualityKey(s) === qualityFilter);
    }
    if (addonFilter === "all") {
      list = list.slice().sort((a, b) => {
        if (matchScores) {
          const dm = (matchScores.get(b) ?? 0) - (matchScores.get(a) ?? 0);
          if (dm !== 0) return dm;
        }
        const ar = addonRank.get(a.addonId) ?? 9999;
        const br = addonRank.get(b.addonId) ?? 9999;
        return ar - br;
      });
    }
    return list;
  }, [baseList, addonFilter, qualityFilter, addonRank, matchScores]);
  const matchedStreams = useMemo(
    () =>
      preferredLangs.length === 0
        ? addonFilteredList
        : addonFilteredList.filter((s) => streamMatchesLangs(s, preferredLangs)),
    [addonFilteredList, preferredLangs],
  );
  const list = filterToPreferred && preferredLangs.length > 0 ? matchedStreams : addonFilteredList;
  const [showCount, setShowCount] = useState(80);
  useEffect(() => {
    setShowCount(80);
  }, [addonFilter, qualityFilter, filterToPreferred, cachedOnly, list.length]);
  const hiddenCount = addonFilteredList.length - matchedStreams.length;
  const uncachedHidden = allStreams.length - cachedStreams.length;
  const activeAddonName =
    addonFilter === "all" ? t("All addons") : addonOptions.find((o) => o.id === addonFilter)?.name ?? addonFilter;
  void cache?.meta.name;
  void cache?.episode;

  if (!open) return null;

  if (kid) {
    return (
      <KidsStreamSwitcher
        list={list}
        onPick={onPick}
        onClose={onClose}
        resolvingKey={resolvingKey}
        currentUrl={currentUrl}
      />
    );
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/72 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[82vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[8px] border border-edge bg-elevated shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)] animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-xl">
        <header className="flex items-center justify-between gap-4 border-b border-edge-soft px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
              {t("Switch stream")}
            </span>
            <span className="text-[14px] font-medium text-ink">
              {cache ? t("{n} sources available", { n: list.length }) : t("No sources cached")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {rejectedStreams.length > 0 && (
              <Tooltip label={t("Show sources hidden by the trust filter")} side="bottom">
                <button
                  onClick={() => setShowFiltered((v) => !v)}
                  className={`flex h-9 items-center gap-2 rounded-md px-3.5 text-[11.5px] font-semibold tracking-[0.04em] transition-colors ${
                    showFiltered
                      ? "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
                      : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
                  }`}
                  aria-pressed={showFiltered}
                >
                  <Filter size={11} strokeWidth={2.2} />
                  {showFiltered ? t("Flagged shown") : t("Show flagged ({n})", { n: rejectedStreams.length })}
                </button>
              </Tooltip>
            )}
            {debridSlugs.length > 0 && uncachedHidden > 0 && (
              <button
                onClick={() => setCachedOnly((v) => !v)}
                className={`flex h-9 items-center gap-2 rounded-md px-3.5 text-[11.5px] font-semibold tracking-[0.04em] transition-colors ${
                  cachedOnly
                    ? "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
                    : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
                }`}
                aria-pressed={cachedOnly}
              >
                <Zap size={11} fill={cachedOnly ? "currentColor" : "none"} strokeWidth={2.2} />
                {cachedOnly ? t("Cached only ({n})", { n: uncachedHidden }) : t("Cached only")}
              </button>
            )}
            {addonOptions.length > 1 && (
              <AddonFilterMenu
                addonFilter={addonFilter}
                setAddonFilter={setAddonFilter}
                open={addonMenuOpen}
                setOpen={setAddonMenuOpen}
                addonOptions={addonOptions}
                addonLogos={addonLogos}
                totalCount={allStreams.length}
                activeAddonName={activeAddonName}
              />
            )}
            {qualityOptions.length > 1 && (
              <QualityFilterMenu
                qualityFilter={qualityFilter}
                setQualityFilter={setQualityFilter}
                open={qualityMenuOpen}
                setOpen={setQualityMenuOpen}
                qualityOptions={qualityOptions}
                totalCount={allStreams.length}
              />
            )}
            {preferredLangs.length > 0 && hiddenCount > 0 && (
              <button
                onClick={() => setFilterToPreferred((v) => !v)}
                className={`flex h-9 items-center gap-2 rounded-md px-3.5 text-[11.5px] font-semibold tracking-[0.04em] transition-colors ${
                  filterToPreferred
                    ? "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
                    : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
                }`}
                aria-pressed={filterToPreferred}
              >
                <Languages size={13} strokeWidth={2.2} />
                {filterToPreferred
                  ? t("{langs} only · {n} hidden", { langs: abbreviateLanguages(preferredLangs), n: hiddenCount })
                  : t("Show {langs} only", { langs: abbreviateLanguages(preferredLangs) })}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
              aria-label={t("Close")}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        {hostSource && <HostSourceBanner source={hostSource} compact />}

        {!cache || list.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-8 py-12 text-center text-[13.5px] text-ink-muted">
            {t("Sources are not cached for this title. Open the picker page to refresh.")}
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-none [&::-webkit-scrollbar-thumb]:border-4 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-ink/25 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb:hover]:bg-ink/40">
            {list.slice(0, showCount).map((s, i) => (
              <SwitcherRow
                key={`${s.addonId}-${s.infoHash ?? s.url ?? i}`}
                stream={s}
                addonLogo={addonLogos.get(s.addonId) ?? null}
                onPick={() => onPick(s)}
                resolving={resolvingKey === streamKey(s)}
                divider={i > 0}
                isCurrent={s.url != null && s.url === currentUrl}
                match={matchBadge(matchScores?.get(s))}
              />
            ))}
            {list.length > showCount && (
              <li className="border-t border-edge-soft/60 px-4 py-3">
                <button
                  onClick={() => setShowCount((n) => n + 80)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-raised px-4 py-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  {t("Load more")}
                  <span className="text-[11px] tabular-nums text-ink-subtle">
                    {t("{n} hidden", { n: list.length - showCount })}
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}

        <footer className="flex items-center justify-between gap-4 border-t border-edge-soft px-6 py-2.5">
          <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <MousePointerClick size={13} strokeWidth={2.2} />
            {t("Click any source to swap in place")}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-subtle">
            <kbd className="inline-flex h-[18px] items-center justify-center rounded-[5px] border border-edge bg-raised px-1.5 font-sans text-[10.5px] font-semibold tracking-normal text-ink-muted">
              Esc
            </kbd>
            {t("to close")}
          </span>
        </footer>
      </div>
    </div>
  );
}

