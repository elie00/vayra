import { searchCinemeta } from "./search";
import type { Meta } from "./cinemeta";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const MAX_SUGGESTIONS = 12;

export type AiSuggestion = { title: string; year?: number; type?: "movie" | "series" };

const SYSTEM_PROMPT =
  "You are a film and TV discovery engine for a media app. The user describes what they want to watch in natural language. Reply with ONLY a JSON array (no prose, no markdown code fences) of up to 12 specific, real movies or TV shows that best match, most relevant first. Each element is an object: {\"title\": string, \"year\": number, \"type\": \"movie\" or \"series\"}. Use the original or most internationally recognized title. Never repeat a title.";

export async function aiSuggest(
  key: string,
  model: string,
  query: string,
): Promise<AiSuggestion[]> {
  const q = query.trim();
  if (!key.trim() || !q) return [];
  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://harbor.site",
      "X-Title": "Harbor",
    },
    body: JSON.stringify({
      model: model.trim() || DEFAULT_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: q },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI search failed (${res.status}). ${detail.slice(0, 160)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseSuggestions(data?.choices?.[0]?.message?.content ?? "");
}

function extractJsonArray(raw: string): string | null {
  const s = raw.replace(/```(?:json)?/gi, "");
  const m = /\[\s*\{/.exec(s);
  if (!m) return null;
  const start = m.index;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseSuggestions(content: string): AiSuggestion[] {
  const span = extractJsonArray(content);
  if (!span) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(span);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: AiSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const dedup = title.toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    const year =
      typeof o.year === "number" && Number.isFinite(o.year) ? Math.round(o.year) : undefined;
    const type = o.type === "series" || o.type === "movie" ? o.type : undefined;
    out.push({ title, year, type });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickBest(pool: Meta[], suggestion: AiSuggestion): Meta | null {
  const target = norm(suggestion.title);
  if (!target) return null;
  let best: Meta | null = null;
  let bestScore = 0;
  for (const m of pool) {
    const name = norm(m.name ?? "");
    if (!name) continue;
    let nameScore = 0;
    if (name === target) nameScore = 5;
    else if (target.length >= 4 && name.includes(target)) nameScore = 3;
    if (nameScore === 0) continue;
    let score = nameScore;
    if (suggestion.type && m.type === suggestion.type) score += 1;
    if (suggestion.year && m.releaseInfo && m.releaseInfo.includes(String(suggestion.year)))
      score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export async function resolveAiSuggestions(suggestions: AiSuggestion[]): Promise<Meta[]> {
  const resolved = await Promise.all(
    suggestions.map(async (s) => {
      try {
        const c = await searchCinemeta(s.title);
        return pickBest([...c.movies, ...c.series], s);
      } catch {
        return null;
      }
    }),
  );
  const out: Meta[] = [];
  const seen = new Set<string>();
  for (const m of resolved) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}
