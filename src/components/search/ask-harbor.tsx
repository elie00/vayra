import { Sparkles, CornerDownLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export function AskHarbor() {
  const { settings } = useSettings();
  const { setOpen, setQuery } = useSearch();
  const t = useT();
  const [text, setText] = useState("");

  // Ne promouvoir l'entrée IA que si une clé est configurée (même garde que AiSearchSection).
  if (!settings.aiSearchKey.trim()) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setQuery(q); // pré-remplit + déclenche le flux existant
    setOpen(true); // ouvre l'overlay, où AiSearchSection s'affiche déjà
  };

  return (
    <form
      onSubmit={submit}
      className="vayra-surface flex flex-col gap-3 p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 text-ink-subtle">
        <Sparkles size={14} strokeWidth={2} className="text-ink-muted" />
        <span className="vayra-kicker">
          {t("Ask VAYRA")}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Describe what you feel like watching…")}
          aria-label={t("Describe what you feel like watching…")}
          className="h-11 flex-1 rounded-xl border border-edge-soft/75 bg-canvas/75 px-4 text-[14.5px] text-ink placeholder:text-ink-subtle transition-colors focus:border-edge focus:outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="mac-primary-button h-11 shrink-0 px-4.5 disabled:opacity-40"
        >
          {t("Ask")}
          <CornerDownLeft size={14} />
        </button>
      </div>
    </form>
  );
}
