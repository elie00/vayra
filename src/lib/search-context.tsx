import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { useParental } from "@/lib/parental";
import { detectIntent, searchAll, searchAnime, searchCinemeta, searchLiveTvChannels, type SearchResults } from "@/lib/search";
import { searchAddonCatalogs, searchAddonGroups, mergeMetas } from "@/lib/search-addons";
import { searchAddonIndex } from "@/lib/search-addon-index";
import { gatherCatalogAddons, type Addon } from "@/lib/addons";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { SEARCH_TIMEOUT_MS, withRequestTimeout, type RequestDiagnostics } from "@/lib/request-outcome";
import { isMagnetInput, isDirectVideoUrl } from "@/lib/torrent/magnet";

export type SearchSource = "tmdb" | "anime" | "catalogs" | "groups" | "cinemeta";
export type SearchSourceStatus = "pending" | "ready" | "empty" | "error" | "skipped";

type SearchState = {
  open: boolean;
  query: string;
  results: SearchResults | null;
  status: "idle" | "typing" | "loading" | "done" | "error";
  sources: Partial<Record<SearchSource, SearchSourceStatus>>;
  recent: string[];
};

type SearchValue = SearchState & {
  setOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
  clear: () => void;
  recordRecent: (q: string) => void;
  removeRecent: (q: string) => void;
  clearRecent: () => void;
  retry: () => void;
};

const Ctx = createContext<SearchValue | null>(null);
const RECENT_KEY = "harbor.search.recent";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* noop */
  }
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const { hiddenTabs } = useParental();
  const [open, setOpen] = useState(false);
  const [queryState, setQueryState] = useState({ query: "" });
  const { query } = queryState;
  const [results, setResults] = useState<SearchResults | null>(null);
  const [status, setStatus] = useState<SearchState["status"]>("idle");
  const [sources, setSources] = useState<SearchState["sources"]>({});
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const queryRef = useRef("");
  const addonsRef = useRef<{ key: string | null; addons: Addon[] } | null>(null);
  const ensureAddons = useCallback(async (diagnostics: RequestDiagnostics): Promise<Addon[]> => {
    if (addonsRef.current && addonsRef.current.key === authKey) return addonsRef.current.addons;
    const a = await gatherCatalogAddons(authKey, diagnostics);
    if (!diagnostics.failed) addonsRef.current = { key: authKey, addons: a };
    return a;
  }, [authKey]);

  useEffect(() => {
    const onAddonsChanged = () => {
      addonsRef.current = null;
    };
    window.addEventListener("vayra:addons-changed", onAddonsChanged);
    return () => window.removeEventListener("vayra:addons-changed", onAddonsChanged);
  }, []);

  const excludeGenres = useMemo(() => {
    const ids: number[] = [];
    if (hiddenTabs.anime) ids.push(MOVIE_GENRES.Animation);
    return ids;
  }, [hiddenTabs.anime]);

  useEffect(() => {
    // Own the generation before the debounce starts. A replaced query or an
    // unmounted provider must never receive a late response from this search.
    const id = ++reqIdRef.current;
    const trimmed = query.trim();
    setResults(null);
    setSources({});
    if (!trimmed) {
      setStatus("idle");
      return;
    }
    setStatus("typing");
    const controller = new AbortController();
    const animeAllowed = !hiddenTabs.anime;
    const liveTvAllowed = !hiddenTabs.liveTv && settings.iptvPlaylists.length > 0;
    const timer = window.setTimeout(() => {
      if (id !== reqIdRef.current) return;
      debounceRef.current = null;
      setStatus("loading");
      const liveTv = liveTvAllowed ? searchLiveTvChannels(trimmed, settings.iptvPlaylists) : [];
      const direct = isMagnetInput(trimmed) || isDirectVideoUrl(trimmed);
      const sourceStates: Record<SearchSource, SearchSourceStatus> = {
        tmdb: !direct && settings.tmdbKey ? "pending" : "skipped",
        anime: !direct && animeAllowed && trimmed.length >= 2 ? "pending" : "skipped",
        catalogs: direct ? "skipped" : "pending",
        groups: direct ? "skipped" : "pending",
        cinemeta: !direct && trimmed.length >= 2 ? "pending" : "skipped",
      };
      let tmdbResult: SearchResults = {
        query: trimmed, topMatch: null, people: [], movies: [], series: [], liveTv: [],
        anime: [], addonGroups: [], addons: [], intent: detectIntent(trimmed),
      };
      const acc = {
        anime: [] as Awaited<ReturnType<typeof searchAnime>>,
        addon: { movies: [], series: [] } as Awaited<ReturnType<typeof searchAddonCatalogs>>,
        cine: { movies: [], series: [] } as Awaited<ReturnType<typeof searchCinemeta>>,
        groups: [] as Awaited<ReturnType<typeof searchAddonGroups>>,
      };
      const publish = () => {
        if (id !== reqIdRef.current || controller.signal.aborted) return;
        const mergedMovies = mergeMetas(mergeMetas(tmdbResult.movies, acc.addon.movies), acc.cine.movies);
        const mergedSeries = mergeMetas(mergeMetas(tmdbResult.series, acc.addon.series), acc.cine.series);
        const shown = new Set<string>([...mergedMovies, ...mergedSeries].map((m) => m.id));
        const dedupedGroups = acc.groups
          .map((g) => ({ ...g, metas: g.metas.filter((m) => !shown.has(m.id)) }))
          .filter((g) => g.metas.length > 0);
        setResults({
          ...tmdbResult,
          movies: mergedMovies,
          series: mergedSeries,
          liveTv,
          anime: acc.anime,
          addonGroups: dedupedGroups,
          addons: searchAddonIndex(trimmed),
        });
        setSources({ ...sourceStates });
        const states = Object.values(sourceStates);
        setStatus(states.includes("pending") ? "loading" : states.includes("error") ? "error" : "done");
      };
      function run<T>(source: SearchSource, request: (diagnostics: RequestDiagnostics) => Promise<T>, accept: (value: T) => boolean) {
        if (sourceStates[source] !== "pending") return;
        const diagnostics = { failed: false };
        void withRequestTimeout(Promise.resolve().then(() => request(diagnostics)), SEARCH_TIMEOUT_MS, controller.signal)
          .then((value) => {
            if (id !== reqIdRef.current || controller.signal.aborted) return;
            const nonempty = accept(value);
            sourceStates[source] = diagnostics.failed ? "error" : nonempty ? "ready" : "empty";
            publish();
          }, () => {
            if (id !== reqIdRef.current || controller.signal.aborted) return;
            sourceStates[source] = "error";
            publish();
          });
      }
      publish();
      run("tmdb", (diagnostics) => searchAll(settings.tmdbKey, trimmed, { excludeGenres, diagnostics }), (r) => {
        tmdbResult = r;
        return !!(r.topMatch || r.movies.length || r.series.length || r.people.length);
      });
      run("anime", (diagnostics) => searchAnime(trimmed, 8, diagnostics), (a) => { acc.anime = a; return a.length > 0; });
      const addonDiagnostics = { failed: false };
      // Share the lookup, but never start remote work for a pasted media URL.
      const addonsP = direct ? Promise.resolve([]) : ensureAddons(addonDiagnostics);
      // Attach both consumers immediately, including lookup rejection handling.
      run("catalogs", async (diagnostics) => {
        const addons = await addonsP;
        diagnostics.failed = addonDiagnostics.failed;
        return searchAddonCatalogs(addons, trimmed, diagnostics);
      }, (a) => { acc.addon = a; return a.movies.length + a.series.length > 0; });
      run("groups", async (diagnostics) => {
        const addons = await addonsP;
        diagnostics.failed = addonDiagnostics.failed;
        return searchAddonGroups(addons, trimmed, diagnostics);
      }, (g) => { acc.groups = g; return g.length > 0; });
      run("cinemeta", (diagnostics) => searchCinemeta(trimmed, diagnostics), (c) => { acc.cine = c; return c.movies.length + c.series.length > 0; });
    }, 180);
    debounceRef.current = timer;
    return () => {
      // Invalidate the current generation, not a captured DOM node/reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++reqIdRef.current;
      controller.abort();
      window.clearTimeout(timer);
      if (debounceRef.current === timer) debounceRef.current = null;
    };
  }, [queryState, query, settings.tmdbKey, settings.iptvPlaylists, excludeGenres, hiddenTabs.anime, hiddenTabs.liveTv, authKey, ensureAddons]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const setQuery = useCallback((q: string) => {
    if (q === queryRef.current) return;
    queryRef.current = q;
    // Invalidate synchronously, rather than waiting for the query effect: a
    // response can settle between the input event and React's next effect.
    ++reqIdRef.current;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // Keep a new query generation even if batched edits return to the same text.
    setQueryState({ query: q });
    setResults(null);
    setSources({});
    setStatus(q.trim() ? "typing" : "idle");
  }, []);

  const clear = useCallback(() => {
    setQuery("");
  }, [setQuery]);

  const retry = useCallback(() => {
    if (!queryRef.current.trim()) return;
    ++reqIdRef.current;
    addonsRef.current = null;
    setResults(null);
    setSources({});
    setStatus("typing");
    setQueryState({ query: queryRef.current });
  }, []);

  const recordRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((q: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p !== q);
      saveRecent(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    saveRecent([]);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, query, setQuery, results, status, sources, recent, clear, retry, recordRecent, removeRecent, clearRecent }),
    [open, query, results, status, sources, recent, setQuery, clear, retry, recordRecent, removeRecent, clearRecent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearch(): SearchValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSearch outside SearchProvider");
  return v;
}
