import { Check, Loader2, Play, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  torrentEngineRestart,
  torrentEngineSelfTest as engineSelfTest,
  torrentEngineStatus as engineStatus,
  type EngineStatus,
} from "@/lib/torrent/local-engine";
import { settingsAnchor } from "../shared";

type SelfTestResult = Awaited<ReturnType<typeof engineSelfTest>>;

type EngineState = "running" | "stopped" | "error";

const PILL: Record<EngineState, { label: string; dot: string; chip: string }> = {
  running: { label: "Running", dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-400" },
  stopped: { label: "Stopped", dot: "bg-ink-subtle", chip: "bg-ink-subtle/15 text-ink-muted" },
  error: { label: "Error", dot: "bg-danger", chip: "bg-danger/15 text-danger" },
};

function engineState(status: EngineStatus | null): EngineState {
  if (status?.last_error) return "error";
  if (status?.ready) return "running";
  return "stopped";
}

export function LocalEngineSection() {
  const { settings } = useSettings();
  const t = useT();
  const strictRemote = !!settings.remoteStreamServerUrl && settings.remoteStreamServerStrict;
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const next = await engineStatus();
      if (alive) setStatus(next);
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await Promise.race([
        engineSelfTest(),
        new Promise<SelfTestResult>((res) => window.setTimeout(() => res(null), 75000)),
      ]);
      setResult(
        r ?? {
          pass: false,
          steps: [{ label: "self-test", ok: false, detail: "timed out, hit Restart engine" }],
        },
      );
    } finally {
      setRunning(false);
    }
  };

  const restart = async () => {
    setRestarting(true);
    setResult(null);
    try {
      const s = await torrentEngineRestart();
      if (s) setStatus(s);
    } finally {
      setRestarting(false);
    }
  };

  const pill = PILL[engineState(status)];

  return (
    <div id={settingsAnchor("Local engine")} className="scroll-mt-28 flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-medium text-ink">{t("Local engine")}</span>
          <span className="text-[12.5px] text-ink-subtle">
            {t("Built-in peer-to-peer streaming, served from your own machine.")}
          </span>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${pill.chip}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
          {t(pill.label)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-ink-subtle">
        <span>
          {t("Port")} <span className="font-mono text-accent">{status?.port ?? "n/a"}</span>
        </span>
        <span>
          {t("Active torrents")} <span className="font-mono text-accent">{status?.active_torrents ?? 0}</span>
        </span>
      </div>

      {status?.last_error && (
        <p className="text-[12px] leading-relaxed text-danger">{status.last_error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={running || strictRemote}
          className="flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-60 disabled:hover:scale-100"
        >
          {running ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Play size={14} strokeWidth={2.4} />
          )}
          {running ? t("Running self-test") : t("Run self-test")}
        </button>
        <button
          type="button"
          onClick={() => void restart()}
          disabled={running || restarting}
          className="flex h-10 items-center gap-2 rounded-lg border border-edge-soft px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink disabled:opacity-60"
        >
          {restarting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RotateCw size={14} strokeWidth={2.4} />
          )}
          {restarting ? t("Restarting") : t("Restart engine")}
        </button>
      </div>

      {strictRemote && (
        <p className="text-[12px] leading-relaxed text-accent/85">
          {t("Self-test is disabled while strict remote streaming is on. It downloads a test torrent over peer-to-peer on this machine.")}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-edge-soft bg-canvas/40 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
              {t("Self-test")}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                result.pass ? "bg-emerald-500/15 text-emerald-400" : "bg-danger/15 text-danger"
              }`}
            >
              {result.pass ? (
                <Check size={12} strokeWidth={2.8} />
              ) : (
                <X size={12} strokeWidth={2.8} />
              )}
              {result.pass ? t("Pass") : t("Fail")}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {result.steps.map((step) => (
              <li key={step.label} className="flex items-center gap-2.5 text-[12.5px]">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                    step.ok ? "text-emerald-400" : "text-danger"
                  }`}
                >
                  {step.ok ? (
                    <Check size={13} strokeWidth={2.8} />
                  ) : (
                    <X size={13} strokeWidth={2.8} />
                  )}
                </span>
                <span className="font-medium text-ink">{step.label}</span>
                {step.detail && (
                  <span className="ms-auto truncate ps-3 text-end font-mono text-[11.5px] text-ink-subtle">
                    {step.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
