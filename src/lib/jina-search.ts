// Light wrapper around Jina's free Reader endpoint to power AI-search web augmentation.
// `r.jina.ai/` accepts an upstream URL as path arg, proxies the page through Jina's
// anti-bot layer, and returns clean markdown. It also accepts DuckDuckGo's HTML SERP
// as a search source for zero-key web discovery.

const READER = "https://r.jina.ai/";
const MAX_RESULTS = 8;
const MAX_SNIPPET_CHARS = 800;

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};

function decodeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "duckduckgo.com" && u.pathname === "/l/") {
      const real = u.searchParams.get("uddg");
      if (real) return decodeURIComponent(real);
    }
    return raw;
  } catch {
    return raw;
  }
}

function parseHits(md: string): WebHit[] {
  const hits: WebHit[] = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && hits.length < MAX_RESULTS) {
    const m = /^\s*\[([^\]]+)\]\(([^)]+)\)/.exec(lines[i]);
    if (!m) { i += 1; continue; }
    const title = m[1].trim();
    const url = decodeUrl(m[2].trim());
    if (!/^https?:/.test(url)) { i += 1; continue; }
    if (url.includes("duckduckgo.com")) { i += 1; continue; }
    if (!title) { i += 1; continue; }
    const buf: string[] = [];
    i += 1;
    while (i < lines.length && buf.length < 4) {
      const ln = lines[i];
      if (/^\s*\[/.test(ln) || /^\s*$/.test(ln)) break;
      buf.push(ln.replace(/[*_`]/g, "").trim());
      i += 1;
    }
    const snippet = buf.join(" ").slice(0, MAX_SNIPPET_CHARS);
    hits.push({ title, url, snippet });
  }
  return hits;
}

async function readerFetch(url: string, apiKey?: string): Promise<string> {
  const headers: Record<string, string> = { Accept: "text/plain" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  const res = await fetch(READER + url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jina error (${res.status}). ${body.slice(0, 120)}`);
  }
  return res.text();
}

export async function webSearch(query: string, apiKey?: string): Promise<WebHit[]> {
  const q = query.trim();
  if (!q) return [];
  const upstream = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const md = await readerFetch(upstream, apiKey);
  return parseHits(md);
}

export async function readUrl(url: string, apiKey?: string): Promise<string> {
  return readerFetch(url, apiKey);
}

export function hitsToContext(hits: WebHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .slice(0, MAX_RESULTS)
    .map((h, i) => `[${i + 1}] ${h.title} — ${h.url}\n${h.snippet}`)
    .join("\n\n");
}

export async function enrichWithContent(
  query: string,
  apiKey?: string,
): Promise<{ hits: WebHit[]; context: string }> {
  const hits = await webSearch(query, apiKey);
  if (hits.length === 0) return { hits: [], context: "" };

  const priority = (u: string) =>
    /wikipedia\.org|themoviedb\.org|rottentomatoes\.com|letterboxd\.com|metacritic\.com/i.test(u) ? 1 : 0;

  const promoted = [...hits].sort((a, b) => priority(b.url) - priority(a.url));
  const toFetch = promoted
    .slice(0, 3)
    .concat(
      promoted.slice(3).filter((h) => priority(h.url) > 0).slice(0, 1),
    )
    .slice(0, 4);

  const enriched = await Promise.all(
    toFetch.map(async (h) => {
      try {
        const md = await readUrl(h.url, apiKey);
        const body = md.split(/\r?\n/).slice(0, 60).join("\n");
        const cleaned = body
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .slice(0, 1200)
          .trim();
        return { ...h, snippet: cleaned };
      } catch {
        return h;
      }
    }),
  );

  const byUrl = new Map(enriched.map((h) => [h.url, h]));
  const finalHits = hits.map((h) => byUrl.get(h.url) ?? h);

  const ctx = finalHits
    .slice(0, MAX_RESULTS)
    .map((h, i) => `[${i + 1}] ${h.title} — ${h.url}\n${h.snippet}`)
    .join("\n\n");
  return { hits: finalHits, context: ctx };
}
