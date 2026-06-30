import { useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import openrouterLogo from "@/assets/ai-logos/openrouter.png";
import { AiModelSelect } from "./ai-model-select";
import { ExtLink, KeyField, Section } from "./shared";

export function AiSearchSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const [keyDraft, setKeyDraft] = useState(settings.aiSearchKey);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  const flash = () => {
    setSaved(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <Section
      title={t("AI search")}
      subtitle={t("Type what you want in plain language and let a model find it. Bring your own OpenRouter key.")}
    >
      <KeyField
        label={t("AI Search · natural-language search")}
        placeholder={t("OpenRouter API key (sk-or-...)")}
        iconSrc={openrouterLogo}
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={() => {
          update({ aiSearchKey: keyDraft.trim() });
          flash();
        }}
        saved={saved}
        help={
          <>
            Adds an "Ask AI" button to search, so you can type things like{" "}
            <em>popular French TV shows last year</em>. Get a key at{" "}
            <ExtLink href="https://openrouter.ai/keys">openrouter.ai/keys</ExtLink>. It only runs when
            you tap that button, so it never costs anything unless you ask.
          </>
        }
      />
      <AiModelSelect
        value={settings.aiSearchModel || DEFAULT_AI_MODEL}
        onChange={(v) => update({ aiSearchModel: v })}
      />
    </Section>
  );
}
