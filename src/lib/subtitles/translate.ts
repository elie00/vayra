import type { SubCue } from "./parser";

// Pure subtitle translation. Timing (start/end) is NEVER touched here — only the
// text of each cue is replaced. Two providers are supported:
//   - OpenRouter (reuses the existing aiSearchKey / aiSearchModel settings)
//   - a local Ollama instance (no API key required)
//
// The batch protocol is intentionally line-based (not JSON) so it survives quotes,
// stray markdown and embedded newlines: every cue is sent on a single line prefixed
// with a ⟦n⟧ marker, internal line breaks replaced by a ⏎ sentinel. The response is
// matched back by marker, so the order the model returns lines in does not matter.

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OR_MODEL = "openai/gpt-4o-mini";
const DEFAULT_OLLAMA_MODEL = "llama3.1";
const DEFAULT_TIMEOUT_MS = 60000; // local Ollama can be slow
const NL = "⏎"; // sentinel for line breaks inside a single cue
const MARK = (i: number) => `⟦${i}⟧`; // e.g. ⟦3⟧

export type TranslateProvider =
  | { kind: "openrouter"; apiKey: string; model: string }
  | { kind: "ollama"; baseUrl: string; model: string };

type OpenRouterProvider = Extract<TranslateProvider, { kind: "openrouter" }>;
type OllamaProvider = Extract<TranslateProvider, { kind: "ollama" }>;

export type TranslateOpts = {
  batchSize?: number; // default 40 cues per request
  signal?: AbortSignal; // user cancellation
  timeoutMs?: number; // default 60000
  onProgress?: (done: number, total: number) => void;
};

export async function translateCues(
  cues: SubCue[],
  targetLanguage: string,
  provider: TranslateProvider,
  opts: TranslateOpts = {},
): Promise<SubCue[]> {
  if (cues.length === 0) return [];
  const batchSize = Math.max(1, opts.batchSize ?? 40);
  const out: SubCue[] = cues.map((c) => ({ ...c })); // copy → timing preserved
  let done = 0;
  for (let i = 0; i < cues.length; i += batchSize) {
    const slice = cues.slice(i, i + batchSize);
    const translated = await translateBatch(slice, targetLanguage, provider, opts);
    for (let j = 0; j < slice.length; j++) {
      const t = translated[j];
      out[i + j].text = t && t.trim() ? t : slice[j].text; // fallback to original on a gap
    }
    done += slice.length;
    opts.onProgress?.(done, cues.length);
  }
  return out;
}

async function translateBatch(
  slice: SubCue[],
  targetLanguage: string,
  provider: TranslateProvider,
  opts: TranslateOpts,
): Promise<(string | null)[]> {
  const sys =
    `You are a professional subtitle translator. Translate each numbered line into ${targetLanguage}. ` +
    `Keep the EXACT same ⟦n⟧ marker at the start of each line, one line per entry, same count, same order. ` +
    `Preserve the ${NL} symbol as a line break marker. Do not merge or add lines. ` +
    `Output ONLY the numbered lines, no commentary.`;
  const user = slice
    .map((c, k) => `${MARK(k + 1)} ${c.text.replace(/\n/g, " " + NL + " ")}`)
    .join("\n");
  const content =
    provider.kind === "openrouter"
      ? await callOpenRouter(provider, sys, user, opts)
      : await callOllama(provider, sys, user, opts);
  return parseNumbered(content, slice.length);
}

function parseNumbered(content: string, count: number): (string | null)[] {
  const out: (string | null)[] = new Array(count).fill(null);
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*⟦(\d+)⟧\s?(.*)$/.exec(line);
    if (!m) continue;
    const idx = parseInt(m[1], 10) - 1;
    if (idx < 0 || idx >= count) continue;
    out[idx] = m[2]
      .split(NL)
      .map((s) => s.trim())
      .join("\n")
      .trim();
  }
  return out;
}

async function callOpenRouter(
  provider: OpenRouterProvider,
  sys: string,
  user: string,
  opts: TranslateOpts,
): Promise<string> {
  const res = await fetchWithTimeout(
    OPENROUTER,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://harbor.site",
        "X-Title": "Harbor",
      },
      body: JSON.stringify({
        model: provider.model.trim() || DEFAULT_OR_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    },
    opts,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Translation failed (${res.status}). ${detail.slice(0, 160)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callOllama(
  provider: OllamaProvider,
  sys: string,
  user: string,
  opts: TranslateOpts,
): Promise<string> {
  const base = provider.baseUrl.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${base}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model.trim() || DEFAULT_OLLAMA_MODEL,
          stream: false,
          options: { temperature: 0.2 },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        }),
      },
      opts,
    );
  } catch (e) {
    // Re-throw cancellation / timeout untouched; everything else is a reachability problem.
    if (e instanceof Error && (e.name === "AbortError" || e.message === "Translation timed out")) {
      throw e;
    }
    throw new Error(`Cannot reach Ollama at ${base}. Is it running? (set OLLAMA_ORIGINS=* if needed)`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${res.status}). Is Ollama running on ${base}? ${detail.slice(0, 160)}`,
    );
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data?.message?.content ?? "";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: TranslateOpts,
): Promise<Response> {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", onAbort);
  }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (timedOut) throw new Error("Translation timed out");
      throw e; // user cancellation → propagate the rejection
    }
    throw e;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
