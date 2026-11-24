import { Check, ChevronRight, Eye, EyeOff, Languages, ListVideo, LogIn, Palette, Play, Puzzle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { THEME_PRESETS, type ThemePresetId } from "@/lib/theme";
import { useVayraAccount } from "@/lib/vayra-account";
import { Section, useSettingsActiveContext } from "./shared";

const QUICK_PALETTES: ThemePresetId[] = ["cool-grey", "obsidian", "sage", "ivory"];

export function BasicsPanel() {
  const t = useT();
  const { user } = useVayraAccount();
  const { settings, update } = useSettings();
  const { setActive } = useSettingsActiveContext();

  const hasSources = [settings.rdKey, settings.tbKey, settings.adKey, settings.pmKey, settings.dlKey].some(Boolean);
  const langs = settings.preferredLanguages;
  const langLabel =
    langs.length === 0 ? t("Any") : langs.length === 1 ? langs[0] : t("{n} languages", { n: langs.length });
  // The season lock is a third mode, set in Playback: neither card is it.
  const playMode = settings.seasonSourceLock ? "season" : settings.instantPlay ? "instant" : "manual";

  return (
    <>
      <SignInRow email={user?.email ?? null} signedIn={!!user} onManage={() => setActive("account")} />

      <Section
        title={t("How Play starts")}
        subtitle={t("Choose whether VAYRA plays immediately or lets you pick a source first.")}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ChoiceCard
            active={playMode === "instant"}
            icon={<Play size={16} strokeWidth={2.1} fill="currentColor" />}
            title={t("Instant")}
            subtitle={t("Starts the best available stream right away.")}
            onClick={() => update({ instantPlay: true, seasonSourceLock: false })}
          />
          <ChoiceCard
            active={playMode === "manual"}
            icon={<ListVideo size={16} strokeWidth={2} />}
            title={t("Choose first")}
            subtitle={t("Shows available sources before playback starts.")}
            onClick={() => update({ instantPlay: false, seasonSourceLock: false })}
          />
        </div>
        {playMode === "season" && (
          <p className="text-[12.5px] leading-snug text-ink-muted">
            {t("Lock to season server is on. Choosing Instant or Choose first turns it off.")}
          </p>
        )}
        <button
          type="button"
          onClick={() => setActive("player")}
          className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <span>{t("More playback options")}</span>
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </Section>

      <Section
        title={t("Look & feel")}
        subtitle={t("Switch atmosphere in one click, or open Appearance for fonts and custom wallpapers.")}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {QUICK_PALETTES.map((id) => {
            const preset = THEME_PRESETS[id];
            const active = settings.theme.preset === id;
            const [bg, surface, accent] = preset.swatch;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ theme: { ...settings.theme, preset: id } })}
                className={`group flex flex-col gap-2.5 rounded-xl border p-3 text-start transition-[border-color,background-color] duration-150 ${
                  active
                    ? "border-ink bg-elevated/90"
                    : "border-edge-soft/75 bg-canvas/50 hover:border-edge hover:bg-elevated/55"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    aria-hidden="true"
                    className="flex h-7 w-14 overflow-hidden rounded-lg border border-white/12 shadow-sm"
                  >
                    <span className="h-full flex-1" style={{ backgroundColor: bg }} />
                    <span className="h-full flex-1" style={{ backgroundColor: surface }} />
                    <span className="h-full w-3.5" style={{ backgroundColor: accent }} />
                  </div>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      active
                        ? "border-ink bg-ink text-canvas"
                        : "border-edge-soft/75 bg-transparent text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                </div>
                <span className="truncate text-[13px] font-semibold text-ink">{t(preset.name)}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setActive("theme")}
          className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <Palette size={13} strokeWidth={2} aria-hidden="true" />
          <span>{t("Customize further")}</span>
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LaunchRow
          icon={<Languages size={18} strokeWidth={2} />}
          title={t("Languages")}
          sub={t("Pick which audio and subtitle languages VAYRA reaches for first.")}
          status={langLabel}
          onClick={() => setActive("language")}
        />
        <LaunchRow
          icon={<Puzzle size={18} strokeWidth={2} />}
          title={t("Extensions and connections")}
          sub={t("Manage content sources and optional connected services.")}
          status={hasSources ? t("Ready") : t("Set up")}
          highlight={!hasSources}
          onClick={() => setActive("connections")}
        />
      </div>
    </>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-start transition-[border-color,background-color] duration-150 ${
        active
          ? "border-ink bg-elevated/90"
          : "border-edge-soft/75 bg-canvas/50 hover:border-edge hover:bg-elevated/55"
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          active
            ? "border-ink bg-ink text-canvas"
            : "border-edge-soft/75 bg-elevated/80 text-ink-muted"
        }`}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        <span className="text-[12.5px] leading-snug text-ink-muted">{subtitle}</span>
      </div>
    </button>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "*****";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 4))}@${domain}`;
}

function SignInRow({
  email,
  signedIn,
  onManage,
}: {
  email: string | null;
  signedIn: boolean;
  onManage: () => void;
}) {
  const t = useT();
  const [reveal, setReveal] = useState(false);

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={onManage}
        className="vayra-surface group flex items-center gap-4 px-5 py-4 text-start transition-[border-color,background-color] duration-150 hover:border-edge hover:bg-elevated/85"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated text-ink">
          <LogIn size={18} strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14.5px] font-semibold text-ink">{t("Sign in or create a VAYRA account")}</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            {t("Use one private VAYRA identity for the app. External services stay optional.")}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-edge-soft/80 bg-elevated px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink">
          {t("Recommended")}
        </span>
        <ChevronRight
          size={16}
          className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5"
        />
      </button>
    );
  }

  return (
    <div className="vayra-surface flex items-center gap-4 px-5 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated text-ink-muted">
        <LogIn size={18} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold text-ink">{t("VAYRA account")}</span>
        <span className="flex items-center gap-2 text-[12.5px] leading-snug text-ink-muted">
          <span className="truncate tracking-wide">
            {email ? (reveal ? email : maskEmail(email)) : t("Your VAYRA identity is connected here.")}
          </span>
          {email && (
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? t("Hide email") : t("Show email")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={onManage}
        className="mac-secondary-button shrink-0"
      >
        {t("Manage")}
        <ChevronRight size={14} className="text-ink-subtle" />
      </button>
    </div>
  );
}

function LaunchRow({
  icon,
  title,
  sub,
  status,
  highlight,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  status?: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vayra-surface group flex w-full items-center gap-3.5 px-4.5 py-4 text-start transition-[border-color,background-color] duration-150 hover:border-edge hover:bg-elevated/85"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 transition-colors ${
          highlight ? "bg-ink/12 text-ink" : "bg-elevated text-ink-muted group-hover:text-ink"
        }`}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-muted">{sub}</span>
      </div>
      {status && (
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
            highlight
              ? "border-ink/25 bg-ink/12 text-ink"
              : "border-edge-soft/75 bg-canvas/70 text-ink-subtle"
          }`}
        >
          {status}
        </span>
      )}
      <ChevronRight
        size={16}
        className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
