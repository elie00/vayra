import { useCallback, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { ScrollRootContext } from "@/components/row";
import { useT } from "@/lib/i18n";
import { DEFAULT_SPORTS_LEAGUES, LEAGUES } from "@/lib/sports/espn";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView } from "@/lib/view";
import { SportsMarquee } from "./live/live-home/sports/sports-marquee";
import { SportsCard } from "./live/live-home/sports/sports-card";
import { useSports } from "./live/live-home/use-sports";

export function SportsHome({ active }: { active: boolean }) {
  const t = useT();
  const { openMatchDetail } = useView();
  const { settings, update } = useSettings();

  // Ligues epinglees par l'utilisateur (modale "Customize Leagues"), avec defaut.
  const userSportsLeagues = settings.sportsLeagues?.length
    ? settings.sportsLeagues
    : DEFAULT_SPORTS_LEAGUES;

  const saveSportsLeagues = useCallback(
    (keys: string[]) => update({ sportsLeagues: keys }),
    [update],
  );

  // "all" = toutes les ligues epinglees, sinon une seule ligue (puce selectionnee).
  const [sportsLeague, setSportsLeague] = useState<string>(() => {
    try {
      return localStorage.getItem("harbor.sports.league") || "all";
    } catch {
      return "all";
    }
  });
  const pickLeague = useCallback((k: string) => {
    setSportsLeague(k);
    try {
      localStorage.setItem("harbor.sports.league", k);
    } catch {}
  }, []);

  const leagues = useMemo(
    () => (sportsLeague === "all" ? userSportsLeagues : [sportsLeague]),
    [sportsLeague, userSportsLeagues],
  );

  // fetchSports(leagues) est appele en interne par useSports (poll 12s + visibilitychange).
  const games = useSports({ enabled: active, leagues });

  // Conteneur scrollable + memoire de scroll (calque sur AnimeView).
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);
  useScrollMemory("sports", scrollRef, active);

  return (
    <main ref={scrollCb} className="flex-1 overflow-y-auto px-12 pt-28 pb-14">
      <ScrollRootContext.Provider value={scrollEl}>
        <div data-tauri-drag-region className="flex flex-col gap-10">
          <div className="flex items-baseline gap-2.5 ps-[9px]">
            <h1 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">
              {t("Sports")}
            </h1>
          </div>

          {/* Marquee reutilisee : puces de ligues + bouton "Customize" +
              SportsCustomizeModal + strip horizontal live/a venir, geres en interne. */}
          <SportsMarquee
            games={games}
            leagues={LEAGUES}
            selected={sportsLeague}
            selectedLeagues={userSportsLeagues}
            onLeague={pickLeague}
            onLeaguesChange={saveSportsLeagues}
            onSelect={openMatchDetail}
          />

          {/* Grille complete de tous les matchs de la selection courante. */}
          {games.length > 0 ? (
            <div className="flex flex-col gap-3 ps-[9px]">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                {t("All games")}
              </h2>
              <div className="flex flex-wrap gap-4">
                {games.map((g) => (
                  <SportsCard key={g.id} game={g} onSelect={openMatchDetail} />
                ))}
              </div>
            </div>
          ) : (
            <div className="ps-[9px] text-[13px] text-ink-subtle">
              {t("No live or upcoming games right now.")}
            </div>
          )}
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}
