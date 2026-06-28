import { ArrowLeft, BarChart3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { library, type LibraryItem } from "@/lib/stremio";
import { useScrollMemory, useView } from "@/lib/view";
import { computeLibraryStats } from "./stats-compute";

function relativeWhen(ts: number, now: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Math.max(0, now - ts);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("Today");
  if (days === 1) return t("Yesterday");
  if (days < 30) return t("{n}d ago", { n: days });
  const months = Math.floor(days / 30);
  return t("{n}mo ago", { n: months });
}

export function StatsView({ active }: { active: boolean }) {
  const t = useT();
  const { goBack } = useView();
  const { authKey } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("stats", scrollRef, active);

  useEffect(() => {
    if (!authKey) {
      setItems([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    library(authKey)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const now = Date.now();
  const stats = useMemo(() => computeLibraryStats(items, now), [items, now]);

  return (
    <main
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-5 pt-24 pb-14 sm:px-8 lg:px-12 lg:pt-28"
    >
      <div data-tauri-drag-region className="flex flex-col gap-7">
        <header className="flex flex-col gap-5">
          <button
            onClick={goBack}
            className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            {t("common.back")}
          </button>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
              {t("My library")}
            </span>
            <h1 className="font-display text-[44px] font-medium leading-[1.05] text-ink">
              {t("Stats")}
            </h1>
            <p className="text-[14px] leading-snug text-ink-muted">
              {t("A snapshot of everything in your library.")}
            </p>
          </div>
        </header>

        {!authKey ? (
          <EmptyCard
            title={t("No stats yet")}
            body={t("Sign in to Stremio to see stats about your library here.")}
          />
        ) : status === "ready" && stats.total === 0 ? (
          <EmptyCard
            title={t("Nothing watched yet")}
            body={t("Press play on something. It'll show up here once you start watching.")}
          />
        ) : (
          <div className="flex flex-col gap-7">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard label={t("In library")} value={stats.total} />
              <StatCard label={t("Watched")} value={stats.watched} />
              <StatCard label={t("In progress")} value={stats.inProgress} />
              <StatCard
                label={t("Completion")}
                value={`${Math.round(stats.completionRate * 100)}%`}
              />
              <StatCard label={t("Hours (est.)")} value={stats.estimatedHours} />
              <StatCard label={t("Movies")} value={stats.movies} />
              <StatCard label={t("Shows")} value={stats.series} />
              <StatCard label={t("Anime")} value={stats.anime} />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <StatCard label={t("Active last 7 days")} value={stats.activeLast7} subtle />
              <StatCard label={t("Active last 30 days")} value={stats.activeLast30} subtle />
            </div>

            {stats.recent.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                  {t("Recently watched")}
                </h2>
                <ul className="flex flex-col divide-y divide-edge-soft/50 overflow-hidden rounded-2xl border border-edge-soft/60 bg-elevated">
                  {stats.recent.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-[13.5px]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                          {r.type === "series" ? t("Show") : t("Movie")}
                        </span>
                        <span className="truncate text-ink">{r.name}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-ink-subtle">
                        {relativeWhen(r.when, now, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[12px] leading-relaxed text-ink-subtle">
              {t("Hours are estimated from playback position and item duration.")}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
      <BarChart3 size={28} strokeWidth={1.6} className="text-ink-subtle" />
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtle,
}: {
  label: string;
  value: number | string;
  subtle?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-2xl border p-5 ${
        subtle ? "border-edge-soft/40 bg-canvas/40" : "border-edge-soft/60 bg-elevated"
      }`}
    >
      <span className="font-display text-[40px] font-medium leading-none tabular-nums text-ink">
        {value}
      </span>
      <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
        {label}
      </span>
    </div>
  );
}
