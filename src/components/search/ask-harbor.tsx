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
      className="rounded-3xl border border-accent/40 bg-accent/10 p-5"
    >
      <div className="mb-3 flex items-center gap-2 text-accent">
        <Sparkles size={16} strokeWidth={2.1} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
          {t("Ask Harbor")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Describe what you feel like watching…")}
          aria-label={t("Describe what you feel like watching…")}
          className="h-12 flex-1 rounded-2xl border border-edge-soft bg-canvas/60 px-4 text-[15px] text-ink placeholder:text-ink-subtle focus:border-accent/60 focus:outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-accent px-5 text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t("Ask")}
          <CornerDownLeft size={15} />
        </button>
      </div>
    </form>
  );
}
