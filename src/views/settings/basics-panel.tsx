import { ChevronRight, Eye, EyeOff, Languages, LogIn, MonitorPlay, Palette, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useVayraAccount } from "@/lib/vayra-account";
import { PlayModePanel } from "./player-panel";
import { Section, useSettingsActiveContext } from "./shared";

const ENGINE_LABEL: Record<string, string> = {
  auto: "Auto",
  html5: "HTML5",
  mpv: "mpv",
};

export function BasicsPanel() {
  const t = useT();
  const { user } = useVayraAccount();
  const { settings } = useSettings();
  const { setActive } = useSettingsActiveContext();

  const debridCount = [settings.rdKey, settings.tbKey, settings.adKey, settings.pmKey, settings.dlKey].filter(
    Boolean,
  ).length;
  const langs = settings.preferredLanguages;
  const langLabel =
    langs.length === 0 ? t("Any") : langs.length === 1 ? langs[0] : t("{n} languages", { n: langs.length });

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <SignInRow email={user?.email ?? null} signedIn={!!user} onManage={() => setActive("account")} />

        <LaunchRow
          icon={<Zap size={19} strokeWidth={2} />}
          title={t("Streaming quality")}
          sub={
            debridCount > 0
              ? t("A debrid service is connected. You'll get instant, high-quality streams.")
              : t("Connect a debrid service (Real-Debrid, TorBox, AllDebrid) for instant HD without the wait.")
          }
          status={debridCount > 0 ? t("{n} connected", { n: debridCount }) : t("Set up")}
          highlight={debridCount === 0}
          onClick={() => setActive("streaming")}
        />
      </div>

      <Section
        title={t("How Play works")}
        subtitle={t("What happens when you hit Play on a title. Instant just starts; Manual lets you pick the source.")}
      >
        <PlayModePanel />
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LaunchRow
          icon={<MonitorPlay size={18} strokeWidth={2} />}
          title={t("Player engine")}
          sub={t("Auto is best for most people. mpv handles the trickiest 4K, HDR, and audio formats.")}
          status={ENGINE_LABEL[settings.playerEngine] ?? settings.playerEngine}
          onClick={() => setActive("player")}
        />
        <LaunchRow
          icon={<Languages size={18} strokeWidth={2} />}
          title={t("Languages")}
          sub={t("Pick which audio and subtitle languages VAYRA reaches for first.")}
          status={langLabel}
          onClick={() => setActive("language")}
        />
        <div className="sm:col-span-2">
          <LaunchRow
            icon={<Palette size={18} strokeWidth={2} />}
            title={t("Theme & appearance")}
            sub={t("Recolor everything, swap fonts, resize posters, set a wallpaper.")}
            status={prettyPreset(settings.theme.preset)}
            onClick={() => setActive("theme")}
          />
        </div>
      </div>
    </>
  );
}

function prettyPreset(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
