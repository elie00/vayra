import { useState, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { useT, useUiLanguage } from "@/lib/i18n";
import {
  getLeagueLabel,
  liveCount,
  LEAGUES,
  type SportsGame,
  type SportsSide,
} from "@/lib/sports/espn";
import { fmtClock } from "@/views/live/live-home/now-format";
import { SportsCustomizeModal } from "@/views/live/live-home/sports/sports-customize-modal";

// Mobile-first Sports room (Apple Sports card model). Rendered from `SportsHome`
// in src/views/sports.tsx when isMobileTauri(); useSports keeps polling (12s +
// visibilitychange) in the original component and its already-computed values
// arrive as props — the branch happens at render, so the hook is untouched.
//
// Single column: scrollable league chips ("All" + the user's pinned leagues,
// each with its logo) + a customize gear that reuses SportsCustomizeModal, then
// match cards grouped by state (Live → Upcoming → Finals). Tapping a card calls
// onSelect(game) → openMatchDetail, exactly like the desktop SportsCard.
//
// Usage (inside SportsHome, right before the desktop return):
//   if (isMobileTauri())
//     return (
//       <MobileSports
//         games={games}
//         selected={sportsLeague}
//         onLeague={pickLeague}
//         selectedLeagues={userSportsLeagues}
//         onLeaguesChange={saveSportsLeagues}
//         onSelect={openMatchDetail}
//       />
//     );
export function MobileSports({
  games,
  selected,
  onLeague,
  selectedLeagues,
  onLeaguesChange,
  onSelect,
}: {
  games: SportsGame[];
  selected: string;
  onLeague: (key: string) => void;
  selectedLeagues: string[];
  onLeaguesChange: (keys: string[]) => void;
  onSelect: (g: SportsGame) => void;
}) {
  const t = useT();
  useUiLanguage();
  const [showCustomize, setShowCustomize] = useState(false);

  const liveGames = games.filter((g) => g.state === "in");
  const upcoming = games
    .filter((g) => g.state === "pre")
    .slice()
    .sort((a, b) => a.startMs - b.startMs);
  const finals = games.filter((g) => g.state === "post");
  const liveN = liveCount(games);

  const chipLeagues = LEAGUES.filter((l) => selectedLeagues.includes(l.key));

  return (
    <main className="flex-1 overflow-y-auto px-4 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))] pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-6 pt-2">
        {/* League chips (horizontal scroll) + customize gear (pinned) */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <LeagueChip active={selected === "all"} label={t("All")} onClick={() => onLeague("all")} />
            {chipLeagues.map((l) => (
              <LeagueChip
                key={l.key}
                active={selected === l.key}
                label={getLeagueLabel(l)}
                logo={l.logo}
                onClick={() => onLeague(l.key)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            aria-label={t("sports.customize")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge-soft/60 bg-elevated text-ink-muted transition-colors active:text-ink"
          >
            <Settings2 size={16} />
          </button>
        </div>

        {games.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-24 text-center">
            <p className="text-[15px] font-semibold text-ink">{t("No games")}</p>
            <p className="text-[13px] text-ink-subtle">{t("No live or upcoming games right now.")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {liveGames.length > 0 && (
              <Section
                heading={t("Live")}
                pill={
                  <span className="flex h-[18px] items-center gap-1 rounded bg-danger px-1.5 text-[10px] font-bold tracking-[0.06em] text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {t("{n} LIVE", { n: liveN })}
                  </span>
                }
              >
                {liveGames.map((g) => (
                  <MatchCard key={g.id} game={g} onSelect={onSelect} />
                ))}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section heading={t("Upcoming")}>
                {upcoming.map((g) => (
                  <MatchCard key={g.id} game={g} onSelect={onSelect} />
                ))}
              </Section>
            )}
            {finals.length > 0 && (
              <Section heading={t("Finals")}>
                {finals.map((g) => (
                  <MatchCard key={g.id} game={g} onSelect={onSelect} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>

      {showCustomize && (
        <SportsCustomizeModal
          selected={selectedLeagues}
          onSave={onLeaguesChange}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </main>
  );
}

function Section({
  heading,
  pill,
  children,
}: {
  heading: string;
  pill?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 ps-1">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
          {heading}
        </h2>
        {pill}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function MatchCard({ game, onSelect }: { game: SportsGame; onSelect: (g: SportsGame) => void }) {
  const live = game.state === "in";
  const post = game.state === "post";
  const pre = game.state === "pre";

  const hasScores =
    (!!game.home.score && game.home.score !== "0") || (!!game.away.score && game.away.score !== "0");
  const hasWinner = game.home.winner || game.away.winner;
  const winIndicator = post && !hasScores && hasWinner;

  return (
    <button
      type="button"
      onClick={() => onSelect(game)}
      className={`relative w-full overflow-hidden rounded-2xl border p-4 text-start transition-transform active:scale-[0.985] ${
        live
          ? "border-danger/30 bg-gradient-to-r from-danger/[0.08] to-transparent"
          : "border-edge-soft/55 bg-elevated/50"
      }`}
    >
      {live && <span className="absolute inset-y-0 start-0 w-1 bg-danger" />}

      <div className="mb-3 flex items-center justify-between gap-2">
        <StatusBadge game={game} />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          {game.league}
        </span>
      </div>

      {pre ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <TeamRow side={game.away} post={post} dim={false} showScore={false} winIndicator={false} />
            <TeamRow side={game.home} post={post} dim={false} showScore={false} winIndicator={false} />
          </div>
          <StartTime ms={game.startMs} detail={game.detail} />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <TeamRow
            side={game.away}
            post={post}
            dim={post && hasWinner && !game.away.winner}
            showScore
            winIndicator={winIndicator}
          />
          <TeamRow
            side={game.home}
            post={post}
            dim={post && hasWinner && !game.home.winner}
            showScore
            winIndicator={winIndicator}
          />
        </div>
      )}
    </button>
  );
}

function TeamRow({
  side,
  post,
  dim,
  showScore,
  winIndicator,
}: {
  side: SportsSide;
  post: boolean;
  dim: boolean;
  showScore: boolean;
  winIndicator: boolean;
}) {
  const winner = post && side.winner;
  return (
    <div className="flex items-center gap-3">
      <TeamLogo src={side.logo} />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={`truncate text-[15px] font-bold uppercase tracking-[0.01em] ${
            dim ? "text-ink-subtle" : "text-ink"
          }`}
        >
          {side.abbr || side.name}
        </span>
        {side.name && side.name !== side.abbr && (
          <span className={`truncate text-[12px] ${dim ? "text-ink-subtle/70" : "text-ink-muted"}`}>
            {side.name}
          </span>
        )}
      </div>
      {showScore && <Score value={side.score} dim={dim} winner={winner} winIndicator={winIndicator} />}
    </div>
  );
}

function Score({
  value,
  dim,
  winner,
  winIndicator,
}: {
  value: string;
  dim: boolean;
  winner: boolean;
  winIndicator: boolean;
}) {
  const t = useT();
  const hasScore = !!value && value !== "";
  const isPosition = hasScore && /^\d+(st|nd|rd|th)$/.test(value);

  if (winIndicator && winner && !hasScore) {
    return (
      <span className="flex h-6 shrink-0 items-center rounded bg-success/20 px-2 text-[11px] font-bold uppercase tracking-wider text-success">
        {t("WIN")}
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 text-end tabular-nums ${
        isPosition ? "text-[16px] font-bold" : "text-[30px] leading-none"
      } ${winner ? "font-black" : "font-bold"} ${dim ? "text-ink-subtle" : "text-ink"}`}
    >
      {hasScore ? value : "0"}
    </span>
  );
}

function StartTime({ ms, detail }: { ms: number; detail: string }) {
  const t = useT();
  const lang = useUiLanguage();
  const locale = lang === "ar" ? "ar-SA" : "en-US";

  if (!ms || isNaN(ms)) {
    return (
      <span className="shrink-0 text-[13px] font-medium text-ink-subtle">{detail || t("TBD")}</span>
    );
  }

  const d = new Date(ms);
  const now = new Date();
  const today = d.toDateString() === now.toDateString();
  const dateStr = today
    ? t("Today")
    : d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex shrink-0 flex-col items-end leading-tight">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{dateStr}</span>
      <span className="text-[22px] font-bold tabular-nums text-ink">{fmtClock(ms)}</span>
    </div>
  );
}

function StatusBadge({ game }: { game: SportsGame }) {
  const t = useT();

  if (game.state === "in") {
    return (
      <span className="flex h-[18px] items-center gap-1 rounded bg-danger px-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        {game.detail || t("Live")}
      </span>
    );
  }

  if (game.state === "post") {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        {game.detail || t("Final")}
      </span>
    );
  }

  return (
    <span className="flex h-[18px] items-center gap-1.5 rounded border border-edge-soft/60 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle/60" />
      {t("Upcoming")}
    </span>
  );
}

function TeamLogo({ src }: { src: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span className="h-7 w-7 shrink-0 rounded-full bg-canvas/60" />;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setErr(true)}
      className="h-7 w-7 shrink-0 object-contain"
    />
  );
}

function LeagueChip({
  active,
  label,
  logo,
  onClick,
}: {
  active: boolean;
  label: string;
  logo?: string;
  onClick: () => void;
}) {
  const [err, setErr] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border ps-1.5 pe-3.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "border-transparent bg-ink text-canvas"
          : "border-edge-soft/60 bg-elevated text-ink-muted"
      }`}
    >
      {logo && !err ? (
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setErr(true)}
          className="h-6 w-6 shrink-0 object-contain"
        />
      ) : (
        <span className="w-1" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
