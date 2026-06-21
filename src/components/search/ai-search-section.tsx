import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { aiSuggest, resolveAiSuggestions } from "@/lib/ai-search";
import type { Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { MetaList } from "./meta-list";

type Status = "idle" | "loading" | "done" | "error";

export function AiSearchSection({ query, onClose }: { query: string; onClose: () => void }) {
  const { settings } = useSettings();
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<Meta[]>([]);
  const [error, setError] = useState("");
  const [ranQuery, setRanQuery] = useState("");
  const reqRef = useRef(0);

  useEffect(() => {
    reqRef.current += 1;
    setStatus("idle");
    setResults([]);
    setError("");
    setRanQuery("");
  }, [query]);

  if (!settings.aiSearchKey.trim() || !query.trim()) return null;

  const run = async () => {
    const id = ++reqRef.current;
    setStatus("loading");
    setError("");
    setRanQuery(query);
    try {
      const suggestions = await aiSuggest(settings.aiSearchKey, settings.aiSearchModel, query);
      if (id !== reqRef.current) return;
      if (suggestions.length === 0) {
        setResults([]);
        setStatus("done");
        return;
      }
      const metas = await resolveAiSuggestions(suggestions);
      if (id !== reqRef.current) return;
      setResults(metas);
      setStatus("done");
    } catch (e) {
      if (id !== reqRef.current) return;
      setError(e instanceof Error ? e.message : t("Something went wrong."));
      setStatus("error");
    }
  };

  return (
    <div className="mb-8">
      {status === "idle" && (
        <button
          onClick={run}
          className="flex h-14 w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-5 text-start transition-colors hover:bg-accent/15"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-accent">
            <Sparkles size={16} strokeWidth={2.1} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              {t("AI search")}
            </span>
            <span className="truncate text-[15px] font-semibold text-ink">
              {t("Ask AI to find titles for \"{query}\"", { query })}
            </span>
          </span>
        </button>
      )}
      {status === "loading" && (
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-edge-soft bg-elevated/40 px-5 text-ink-muted">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[14px]">{t("Asking AI…")}</span>
        </div>
      )}
      {status === "error" && (
        <button
          onClick={run}
          className="flex w-full flex-col gap-1 rounded-2xl border border-danger/40 bg-danger/10 px-5 py-3 text-start transition-colors hover:bg-danger/15"
        >
          <span className="text-[13px] font-semibold text-ink">
            {t("AI search failed. Tap to retry.")}
          </span>
          <span className="line-clamp-2 text-[12px] text-ink-muted">{error}</span>
        </button>
      )}
      {status === "done" &&
        ranQuery === query &&
        (results.length > 0 ? (
          <MetaList title={t("AI picks")} items={results} onClose={onClose} />
        ) : (
          <div className="rounded-2xl border border-edge-soft bg-elevated/30 px-5 py-4 text-[13px] text-ink-muted">
            {t("AI didn't find anything for that. Try rephrasing.")}
          </div>
        ))}
    </div>
  );
}
