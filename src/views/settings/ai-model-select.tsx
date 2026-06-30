import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { AI_MODELS, PROVIDER_NAME, type AiProvider } from "@/lib/ai-models";
import anthropicLogo from "@/assets/ai-logos/anthropic.png";
import deepseekLogo from "@/assets/ai-logos/deepseek.png";
import geminiLogo from "@/assets/ai-logos/gemini.png";
import metaLogo from "@/assets/ai-logos/meta.png";
import mistralLogo from "@/assets/ai-logos/mistral.png";
import openaiLogo from "@/assets/ai-logos/openai.png";
import qwenLogo from "@/assets/ai-logos/qwen.png";
import xaiLogo from "@/assets/ai-logos/xai.png";

const LOGOS: Record<AiProvider, string> = {
  openai: openaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  meta: metaLogo,
  mistral: mistralLogo,
  deepseek: deepseekLogo,
  xai: xaiLogo,
  qwen: qwenLogo,
};

function ProviderLogo({ provider }: { provider: AiProvider }) {
  return (
    <img
      src={LOGOS[provider]}
      alt=""
      draggable={false}
      className="h-[19px] w-[19px] shrink-0 rounded-[5px] bg-white object-contain ring-1 ring-black/10"
    />
  );
}

export function AiModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const current = AI_MODELS.find((m) => m.id === value);
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="shrink-0 text-[12px] text-ink-subtle">{t("Model")}</span>
      <div ref={ref} className="relative flex-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-start transition-colors ${
            open ? "border-edge bg-elevated" : "border-edge-soft bg-canvas/60 hover:border-edge"
          }`}
        >
          {current ? (
            <>
              <ProviderLogo provider={current.provider} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{current.label}</span>
                <span className="shrink-0 text-[11px] text-ink-subtle">{PROVIDER_NAME[current.provider]}</span>
              </span>
            </>
          ) : (
            <span className="flex-1 truncate font-mono text-[12px] text-ink-muted">
              {value || t("Choose a model")}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 flex max-h-[320px] flex-col overflow-y-auto rounded-2xl border border-edge bg-canvas py-1.5 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            {AI_MODELS.map((m) => {
              const sel = m.id === value;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-2 text-start transition-colors ${
                    sel ? "bg-elevated" : "hover:bg-elevated/60"
                  }`}
                >
                  <ProviderLogo provider={m.provider} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[13px] text-ink ${sel ? "font-semibold" : ""}`}>
                      {m.label}
                    </span>
                    <span className="truncate text-[11px] text-ink-subtle">{PROVIDER_NAME[m.provider]}</span>
                  </span>
                  {sel && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
